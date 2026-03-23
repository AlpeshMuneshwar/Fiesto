import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../prisma';
import { io } from '../socket';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, checkoutRequestSchema, paymentVerifySchema } from '../validators';
import fs from 'fs';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ==========================================
// Secure file upload configuration
// ==========================================

// Allowed MIME types for receipt images
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Sanitize original extension
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
        cb(null, 'receipt-' + uniqueSuffix + safeExt);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1, // Only one file per upload
    },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP images are allowed.`));
            return;
        }
        cb(null, true);
    },
});

// Multer error handler wrapper
const handleMulterError = (err: any, req: Request, res: Response, next: any) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
};

// ==========================================
// Routes
// ==========================================

// GET pending checkout requests for this cafe's waiters
router.get('/pending', authenticate, requireRole(['WAITER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const cafeId = req.user!.cafeId;
    // For now, return sessions with active orders that are DELIVERED but session still active (awaiting payment)
    const sessions = await prisma.session.findMany({
        where: {
            cafeId,
            isActive: true,
            orders: { some: { status: 'DELIVERED' } }
        },
        include: {
            table: true,
            orders: {
                where: { status: 'DELIVERED' }
            }
        }
    });

    // Map to a format the waiter dashboard expects
    const pending = sessions.map(s => ({
        id: s.id,
        sessionId: s.id,
        tableNumber: s.table.number,
        amount: s.orders.reduce((sum, o) => sum + o.totalAmount, 0),
        order: {
            session: {
                table: { number: s.table.number }
            }
        }
    }));

    res.json(pending);
}));

// Waiter / Counter generating a bill for a session
// ==========================================
router.post('/generate-bill/:sessionId', authenticate, requireRole(['WAITER', 'ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params.sessionId as string;
    
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { orders: true, table: true, cafe: { include: { settings: true } } }
    });

    if (!session || !session.isActive) {
        res.status(404).json({ error: 'Active session not found' });
        return;
    }

    // Aggregate orders including Phase 4 pre-booking fields
    const allOrders = session.orders;
    const totalSubtotal = allOrders.reduce((sum, o) => sum + o.subtotal, 0);
    const totalTax = allOrders.reduce((sum, o) => sum + o.taxAmount, 0);
    const totalServiceCharge = allOrders.reduce((sum, o) => sum + o.serviceCharge, 0);
    const totalPlatformFee = allOrders.reduce((sum, o) => sum + o.platformFee, 0);
    const totalAdvancePaid = allOrders.reduce((sum, o) => sum + o.advancePaid, 0);
    const grandTotal = allOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // Final amount to process = Grand total + Platform fees - Advance already paid
    const totalAmountToPay = Math.max(0, grandTotal + totalPlatformFee - totalAdvancePaid);

    res.json({
        message: 'Bill generated successfully',
        bill: {
            sessionId: session.id,
            tableNumber: session.table.number,
            ordersCount: allOrders.length,
            subtotal: totalSubtotal,
            taxAmount: totalTax,
            serviceCharge: totalServiceCharge,
            platformFee: totalPlatformFee,
            advancePaid: totalAdvancePaid,
            grandTotal,
            totalAmountToPay,
            currencySymbol: session.cafe.settings?.currencySymbol || '₹'
        }
    });
}));

// Waiter / Counter marks payment as complete and ends session
// ==========================================
router.post('/complete/:sessionId', authenticate, requireRole(['WAITER', 'ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params.sessionId as string;

    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { orders: true, table: true, cafe: true }
    });

    if (!session || !session.isActive) {
        res.status(404).json({ error: 'Active session not found' });
        return;
    }

    // Mark orders as COMPLETED
    for (const order of session.orders) {
        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'COMPLETED' }
        });
    }

    // Calculate totals for receipt
    const allOrders = session.orders;
    const grandTotal = allOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const platformFee = allOrders.reduce((sum, o) => sum + o.platformFee, 0);
    const advancePaid = allOrders.reduce((sum, o) => sum + o.advancePaid, 0);
    
    const totalAmountToPay = Math.max(0, grandTotal + platformFee - advancePaid);

    // Aggregate items
    const allItems: any[] = [];
    allOrders.forEach(o => {
        try {
            const items = JSON.parse(o.items);
            allItems.push(...items);
        } catch (e) { }
    });

    // Emit event to close the customer session
    io.to(sessionId).emit('session_finalized', {
        message: 'Your payment is complete. Thank you!',
        bill: {
            cafeName: session.cafe.name,
            tableNumber: session.table.number,
            totalAmount: totalAmountToPay,
            advancePaid,
            platformFee,
            items: allItems,
            date: new Date()
        }
    });

    // End session
    await prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false, isPrebooked: false }
    });

    res.json({ message: 'Payment complete and session ended' });
}));

export default router;
