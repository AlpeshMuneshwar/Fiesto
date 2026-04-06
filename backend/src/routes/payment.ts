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
    const cafeId = req.headers['x-cafe-id'] as string;
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
    const pending = sessions.map((s: any) => ({
        id: s.id,
        sessionId: s.id,
        tableNumber: s.table.number,
        amount: s.orders.reduce((sum: number, o: any) => sum + o.totalAmount, 0),
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
router.post('/generate-bill/:sessionId', authenticate, requireRole(['WAITER', 'ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;
    
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { orders: true, table: true, cafe: { include: { settings: true } } }
    }) as any;

    if (!session || !session.isActive) {
        res.status(404).json({ error: 'Active session not found' });
        return;
    }

    // Aggregate orders including Phase 4 pre-booking fields
    const allOrders = session.orders;
    const totalSubtotal = allOrders.reduce((sum: number, o: any) => sum + o.subtotal, 0);
    const totalTax = allOrders.reduce((sum: number, o: any) => sum + o.taxAmount, 0);
    const totalServiceCharge = allOrders.reduce((sum: number, o: any) => sum + o.serviceCharge, 0);
    const totalPlatformFee = allOrders.reduce((sum: number, o: any) => sum + o.platformFee, 0);
    const totalAdvancePaid = allOrders.reduce((sum: number, o: any) => sum + o.advancePaid, 0);
    const grandTotal = allOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);

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
router.post('/complete/:sessionId', authenticate, requireRole(['WAITER', 'ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;

    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { orders: true, table: true, cafe: true }
    }) as any;

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
    const grandTotal = allOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);
    const platformFee = allOrders.reduce((sum: number, o: any) => sum + o.platformFee, 0);
    const advancePaid = allOrders.reduce((sum: number, o: any) => sum + o.advancePaid, 0);
    
    const totalAmountToPay = Math.max(0, grandTotal + platformFee - advancePaid);

    // Aggregate items
    const allItems: any[] = [];
    allOrders.forEach((o: any) => {
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
            cafeAddress: session.cafe.address,
            logoUrl: session.cafe.logoUrl,
            // Include GST/Tax settings
            gstNumber: (session.cafe as any).settings?.gstNumber || '',
            taxLabel: (session.cafe as any).settings?.taxLabel || 'GST',
            taxRate: (session.cafe as any).settings?.taxRate || 0,
            serviceChargeRate: (session.cafe as any).settings?.serviceChargeRate || 0,
            
            tableNumber: session.table.number,
            totalAmount: totalAmountToPay,
            subtotal: allOrders.reduce((sum: number, o: any) => sum + o.subtotal, 0),
            taxAmount: allOrders.reduce((sum: number, o: any) => sum + o.taxAmount, 0),
            serviceCharge: allOrders.reduce((sum: number, o: any) => sum + o.serviceCharge, 0),
            advancePaid,
            platformFee,
            items: allItems,
            date: new Date(),
            sessionId: session.id.slice(-8).toUpperCase()
        }
    });

    // End session
    await prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false, isPrebooked: false }
    });

    res.json({ message: 'Payment complete and session ended' });
}));

// ==========================================
// NEW PAYMENT WORKFLOW ROUTES
// ==========================================

// Customer requests payment (calls waiter for bill)
router.post('/request-payment/:sessionId', asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;
    
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { 
            orders: true, 
            table: true,
            cafe: { include: { settings: true } }
        }
    }) as any;

    if (!session || !session.isActive) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    // Generate bill details
    const allOrders = session.orders;
    const totalSubtotal = allOrders.reduce((sum: number, o: any) => sum + o.subtotal, 0);
    const totalTax = allOrders.reduce((sum: number, o: any) => sum + o.taxAmount, 0);
    const totalServiceCharge = allOrders.reduce((sum: number, o: any) => sum + o.serviceCharge, 0);
    const totalPlatformFee = allOrders.reduce((sum: number, o: any) => sum + o.platformFee, 0);
    const totalAdvancePaid = allOrders.reduce((sum: number, o: any) => sum + o.advancePaid, 0);
    const grandTotal = allOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);
    const totalAmountToPay = Math.max(0, grandTotal + totalPlatformFee - totalAdvancePaid);

    // Notify all waiters/admins in the cafe
    io.to('WAITER_' + session.cafeId).emit('payment_call_received', {
        sessionId,
        tableNumber: session.table.number,
        tableId: session.tableId,
        totalAmount: totalAmountToPay,
        message: `Table ${session.table.number} is requesting payment`
    });

    res.json({ 
        message: 'Payment request sent to waiter',
        billAmount: totalAmountToPay
    });
}));

// Waiter acknowledges payment request
router.post('/acknowledge-payment/:sessionId', authenticate, requireRole(['WAITER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;
    const waiterId = req.user?.id;
    const cafeId = req.user?.cafeId;
    
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { 
            orders: true,
            table: true,
            cafe: { include: { settings: true } }
        }
    }) as any;

    if (!session || !session.isActive || session.cafeId !== cafeId) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    // Create/update payment record
    const allOrders = session.orders;
    const totalAmount = allOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);
    
    let payment = await prisma.payment.findFirst({
        where: { orderId: allOrders[0]?.id }
    });

    if (!payment) {
        payment = await prisma.payment.create({
            data: {
                orderId: allOrders[0]?.id as string,
                amount: totalAmount,
                status: 'PENDING',
                paymentStage: 'ACKNOWLEDGED',
                acknowledgedBy: waiterId,
                acknowledgedAt: new Date(),
                createdBy: waiterId
            } as any
        }) as any;
    } else {
        payment = await prisma.payment.update({
            where: { id: (payment as any).id },
            data: {
                paymentStage: 'ACKNOWLEDGED',
                acknowledgedBy: waiterId,
                acknowledgedAt: new Date(),
                updatedBy: waiterId
            } as any
        }) as any;
    }

    // Notify customer that waiter is coming
    io.to(sessionId).emit('payment_acknowledged', {
        message: 'Waiter is coming to take your payment',
        waiterName: req.user?.name
    });

    res.json({ 
        message: 'Payment acknowledged',
        payment,
        bill: {
            sessionId,
            tableNumber: session.table.number,
            totalAmount,
            items: allOrders.flatMap((o: any) => {
                try {
                    return JSON.parse(o.items);
                } catch {
                    return [];
                }
            }),
            currencySymbol: session.cafe.settings?.currencySymbol || '₹'
        }
    });
}));

// Waiter marks payment as completed
router.post('/complete-payment/:sessionId', authenticate, requireRole(['WAITER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;
    const { paymentMethod } = req.body; // CASH, DIGITAL, etc.
    const waiterId = req.user?.id;
    const cafeId = req.user?.cafeId;
    
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { 
            orders: true,
            table: true,
            cafe: { include: { settings: true } }
        }
    }) as any;

    if (!session || !session.isActive || session.cafeId !== cafeId) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    const allOrders = session.orders;
    const totalAmount = allOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);

    // Update payment and all orders
    const payment = await prisma.payment.findFirst({
        where: { orderId: allOrders[0]?.id }
    });

    if (payment) {
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'COMPLETED',
                paymentStage: 'COMPLETED',
                waiterVerified: true,
                updatedBy: waiterId
            } as any
        });
    }

    // Mark all orders as DELIVERED/COMPLETED
    for (const order of allOrders) {
        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'DELIVERED' }
        });
    }

    // Generate receipt
    const receipt = {
        cafeName: session.cafe.name,
        cafeAddress: session.cafe.address,
        logoUrl: session.cafe.logoUrl,
        gstNumber: (session.cafe as any).settings?.gstNumber || '',
        taxLabel: (session.cafe as any).settings?.taxLabel || 'GST',
        tableNumber: session.table.number,
        sessionId: session.id.slice(-8).toUpperCase(),
        items: allOrders.flatMap((o: any) => {
            try {
                return JSON.parse(o.items);
            } catch {
                return [];
            }
        }),
        subtotal: allOrders.reduce((sum: number, o: any) => sum + o.subtotal, 0),
        taxAmount: allOrders.reduce((sum: number, o: any) => sum + o.taxAmount, 0),
        serviceCharge: allOrders.reduce((sum: number, o: any) => sum + o.serviceCharge, 0),
        totalAmount,
        paymentMethod,
        date: new Date(),
        currencySymbol: session.cafe.settings?.currencySymbol || '₹'
    };

    // Notify customer payment is complete
    io.to(sessionId).emit('payment_completed', {
        message: 'Payment completed. Thank you!',
        receipt
    });

    res.json({ 
        message: 'Payment marked as complete',
        receipt,
        canSendEmail: true
    });
}));

// Waiter sends bill via email
router.post('/send-bill-email/:sessionId', authenticate, requireRole(['WAITER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;
    const { customerEmail } = req.body;
    const waiterId = req.user?.id;
    const cafeId = req.user?.cafeId;
    
    if (!customerEmail || !customerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        res.status(400).json({ error: 'Invalid email address' });
        return;
    }

    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { 
            orders: true,
            table: true,
            cafe: { include: { settings: true } }
        }
    }) as any;

    if (!session || session.cafeId !== cafeId) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    const payment = await prisma.payment.findFirst({
        where: { orderId: session.orders[0]?.id }
    });

    if (!payment) {
        res.status(404).json({ error: 'Payment record not found' });
        return;
    }

    // Generate bill HTML
    const allOrders = session.orders;
    const totalAmount = allOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);
    const taxAmount = allOrders.reduce((sum: number, o: any) => sum + o.taxAmount, 0);
    const serviceCharge = allOrders.reduce((sum: number, o: any) => sum + o.serviceCharge, 0);
    const subtotal = allOrders.reduce((sum: number, o: any) => sum + o.subtotal, 0);

    const items = allOrders.flatMap((o: any) => {
        try {
            return JSON.parse(o.items);
        } catch {
            return [];
        }
    });

    const billHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 30px;">
        <div style="text-align: center; margin-bottom: 30px;">
            ${session.cafe.logoUrl ? `<img src="${session.cafe.logoUrl}" alt="Logo" style="max-width: 150px; margin-bottom: 10px;">` : ''}
            <h1 style="margin: 10px 0; color: #333;">${session.cafe.name}</h1>
            <p style="color: #666; margin: 5px 0;">${session.cafe.address || ''}</p>
            ${(session.cafe.settings as any)?.gstNumber ? `<p style="color: #666; margin: 5px 0;">GST: ${(session.cafe.settings as any).gstNumber}</p>` : ''}
        </div>
        
        <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;">
        
        <div style="margin-bottom: 20px;">
            <p><strong>Table:</strong> ${session.table.number}</p>
            <p><strong>Order ID:</strong> ${session.id.slice(-8).toUpperCase()}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        
        <div style="margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #333;">
                        <th style="text-align: left; padding: 10px; font-weight: bold;">Item</th>
                        <th style="text-align: center; padding: 10px; font-weight: bold;">Qty</th>
                        <th style="text-align: right; padding: 10px; font-weight: bold;">Price</th>
                        <th style="text-align: right; padding: 10px; font-weight: bold;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item: any) => `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px; text-align: left;">${item.name}</td>
                        <td style="padding: 10px; text-align: center;">${item.quantity}</td>
                        <td style="padding: 10px; text-align: right;">${(session.cafe.settings as any)?.currencySymbol || '₹'}${item.price.toFixed(2)}</td>
                        <td style="padding: 10px; text-align: right;">${(session.cafe.settings as any)?.currencySymbol || '₹'}${(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                <span>Subtotal:</span>
                <span>${(session.cafe.settings as any)?.currencySymbol || '₹'}${subtotal.toFixed(2)}</span>
            </div>
            ${taxAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                <span>${(session.cafe.settings as any)?.taxLabel || 'Tax'} (${(session.cafe.settings as any)?.taxRate || 0}%):</span>
                <span>${(session.cafe.settings as any)?.currencySymbol || '₹'}${taxAmount.toFixed(2)}</span>
            </div>
            ` : ''}
            ${serviceCharge > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                <span>Service Charge:</span>
                <span>${(session.cafe.settings as any)?.currencySymbol || '₹'}${serviceCharge.toFixed(2)}</span>
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 10px 0; font-weight: bold; font-size: 16px;">
                <span>Total:</span>
                <span>${(session.cafe.settings as any)?.currencySymbol || '₹'}${totalAmount.toFixed(2)}</span>
            </div>
        </div>
        
        <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;">
        
        <div style="text-align: center; color: #666; font-size: 14px;">
            <p>Thank you for your visit!</p>
            <p>Please visit us again soon.</p>
            <p style="margin-top: 20px; font-size: 12px; color: #999;">Generated on ${new Date().toLocaleString()}</p>
        </div>
    </div>
    `;

    // Send email
    try {
        const { sendEmail } = await import('../utils/email');
        await sendEmail(
            customerEmail,
            `Bill Receipt from ${session.cafe.name}`,
            billHTML
        );

        // Update payment record
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                billEmail: customerEmail,
                emailSentAt: new Date(),
                updatedBy: waiterId
            } as any
        });

        // Notify customer
        io.to(sessionId).emit('bill_sent_email', {
            message: `Receipt sent to ${customerEmail}`,
            email: customerEmail
        });

        res.json({ 
            message: 'Bill sent successfully to customer email',
            email: customerEmail
        });
    } catch (error) {
        console.error('Email sending error:', error);
        res.status(500).json({ error: 'Failed to send email. Please try again.' });
    }
}));

// Get receipt details
router.get('/receipt/:sessionId', asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;
    
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { 
            orders: true,
            table: true,
            cafe: { include: { settings: true } }
        }
    }) as any;

    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    const allOrders = session.orders;
    const totalAmount = allOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);
    const taxAmount = allOrders.reduce((sum: number, o: any) => sum + o.taxAmount, 0);
    const serviceCharge = allOrders.reduce((sum: number, o: any) => sum + o.serviceCharge, 0);
    const subtotal = allOrders.reduce((sum: number, o: any) => sum + o.subtotal, 0);

    const receipt = {
        cafeName: session.cafe.name,
        cafeAddress: session.cafe.address,
        logoUrl: session.cafe.logoUrl,
        gstNumber: (session.cafe.settings as any)?.gstNumber || '',
        taxLabel: (session.cafe.settings as any)?.taxLabel || 'GST',
        tableNumber: session.table.number,
        sessionId: session.id.slice(-8).toUpperCase(),
        items: allOrders.flatMap((o: any) => {
            try {
                return JSON.parse(o.items);
            } catch {
                return [];
            }
        }),
        subtotal,
        taxAmount,
        serviceCharge,
        totalAmount,
        date: new Date(),
        currencySymbol: (session.cafe.settings as any)?.currencySymbol || '₹'
    };

    res.json(receipt);
}));

export default router;
