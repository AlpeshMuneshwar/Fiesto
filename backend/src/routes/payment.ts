import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../prisma';
import { io } from '../socket';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, checkoutRequestSchema, paymentVerifySchema, razorpayCreateOrderSchema, razorpayVerifySchema } from '../validators';
import fs from 'fs';
import { asyncHandler } from '../middleware/error-handler';
import { activateNextQueuedReservation } from '../utils/reservation-queue';
import { ApiError } from '../middleware/error-handler';
import { isRazorpayConfigured, razorpayConfig } from '../config/payments';
import { getRazorpayClient, verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from '../services/razorpay';
import { getPreorderPaymentWindowMinutes, isPreorderType } from '../utils/operational-mode';

const router = Router();

const parseItems = (orders: any[]) =>
    orders.flatMap((order: any) => {
        try {
            return JSON.parse(order.items);
        } catch {
            return [];
        }
    });

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);

const markPaymentCaptured = async (paymentId: string, data: {
    providerPaymentId: string;
    providerSignature?: string;
    webhookEventId?: string;
    webhookPayload?: string;
}) => {
    return prisma.payment.update({
        where: { id: paymentId },
        data: {
            status: 'COMPLETED',
            paymentStage: 'COMPLETED',
            provider: 'RAZORPAY',
            providerPaymentId: data.providerPaymentId,
            providerSignature: data.providerSignature,
            webhookEventId: data.webhookEventId,
            webhookPayload: data.webhookPayload,
            webhookReceivedAt: data.webhookEventId ? new Date() : undefined,
            capturedAt: new Date(),
            transactionId: data.providerPaymentId,
            updatedBy: data.webhookEventId ? 'RAZORPAY_WEBHOOK' : 'RAZORPAY_VERIFY',
        } as any,
    });
};

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

router.get('/razorpay/config', asyncHandler(async (req: Request, res: Response) => {
    res.json({
        enabled: isRazorpayConfigured,
        keyId: razorpayConfig.keyId || null,
    });
}));

router.post('/razorpay/create-order', validate(razorpayCreateOrderSchema), asyncHandler(async (req: Request, res: Response) => {
    if (!isRazorpayConfigured) {
        throw new ApiError(503, 'Razorpay is not configured yet. Add the key, secret, and webhook secret first.', 'RAZORPAY_NOT_CONFIGURED');
    }

    const { orderId, notes } = req.body;

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            session: {
                include: {
                    table: true,
                    cafe: { include: { settings: true } },
                }
            },
            payment: true,
        }
    }) as any;

    if (!order) {
        throw new ApiError(404, 'Order not found', 'ORDER_NOT_FOUND');
    }

    const preorderLike = isPreorderType(order.orderType, order.isPreorder);
    if (preorderLike && order.status !== 'RECEIVED') {
        throw new ApiError(
            403,
            'This preorder/takeaway is waiting for owner or manager approval before payment.',
            'PREORDER_APPROVAL_REQUIRED'
        );
    }

    if (preorderLike) {
        const paymentWindowMinutes = getPreorderPaymentWindowMinutes(order.session?.cafe?.settings as any);
        const expiresAt = order.approvalExpiresAt
            ? new Date(order.approvalExpiresAt)
            : addMinutes(new Date(order.updatedAt), paymentWindowMinutes);

        if (expiresAt.getTime() < Date.now()) {
            throw new ApiError(
                410,
                'Approval payment window has expired. Ask owner/manager to re-approve your preorder.',
                'PREORDER_PAYMENT_WINDOW_EXPIRED',
                { approvalExpiresAt: expiresAt.toISOString() }
            );
        }
    }

    const payableAmount = Math.round(Math.max(0, order.advancePaid + order.platformFee) * 100);
    if (payableAmount <= 0) {
        throw new ApiError(400, 'This order does not require online payment.', 'PAYMENT_NOT_REQUIRED');
    }

    if (order.payment?.status === 'COMPLETED') {
        throw new ApiError(409, 'Payment has already been captured for this order.', 'PAYMENT_ALREADY_COMPLETED');
    }

    const receipt = `order_${order.id.replace(/-/g, '').slice(0, 24)}`;
    const razorpay = getRazorpayClient();
    const razorpayOrder = await razorpay.orders.create({
        amount: payableAmount,
        currency: order.session.cafe.settings?.currency || 'INR',
        receipt,
        notes: {
            cafeId: order.cafeId,
            sessionId: order.sessionId,
            orderId: order.id,
            tableNumber: String(order.session.table?.number || ''),
            ...(notes || {}),
        },
    });

    const payment = order.payment
        ? await prisma.payment.update({
            where: { id: order.payment.id },
            data: {
                amount: payableAmount / 100,
                provider: 'RAZORPAY',
                providerOrderId: razorpayOrder.id,
                status: 'PENDING',
                paymentStage: 'PENDING',
                lastError: null,
                updatedBy: 'RAZORPAY_ORDER_CREATE',
            } as any,
        })
        : await prisma.payment.create({
            data: {
                orderId: order.id,
                amount: payableAmount / 100,
                provider: 'RAZORPAY',
                providerOrderId: razorpayOrder.id,
                status: 'PENDING',
                paymentStage: 'PENDING',
                createdBy: 'RAZORPAY_ORDER_CREATE',
                updatedBy: 'RAZORPAY_ORDER_CREATE',
            } as any,
        });

    res.json({
        message: 'Razorpay order created successfully',
        paymentId: payment.id,
        order: razorpayOrder,
        keyId: razorpayConfig.keyId,
        payableAmount: payableAmount / 100,
    });
}));

router.post('/razorpay/verify', validate(razorpayVerifySchema), asyncHandler(async (req: Request, res: Response) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!verifyRazorpayPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
    })) {
        throw new ApiError(400, 'Invalid Razorpay payment signature.', 'INVALID_RAZORPAY_SIGNATURE');
    }

    const payment = await prisma.payment.findFirst({
        where: { providerOrderId: razorpay_order_id } as any,
        include: { order: true },
    }) as any;

    if (!payment) {
        throw new ApiError(404, 'Payment record not found for this Razorpay order.', 'PAYMENT_RECORD_NOT_FOUND');
    }

    const updatedPayment = payment.status === 'COMPLETED'
        ? payment
        : await markPaymentCaptured(payment.id, {
            providerPaymentId: razorpay_payment_id,
            providerSignature: razorpay_signature,
        });

    res.json({
        message: 'Razorpay payment verified successfully',
        payment: updatedPayment,
    });
}));

router.post('/razorpay/webhook', asyncHandler(async (req: Request, res: Response) => {
    if (!isRazorpayConfigured) {
        throw new ApiError(503, 'Razorpay webhook received but Razorpay is not configured.', 'RAZORPAY_NOT_CONFIGURED');
    }

    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string' || !signature) {
        throw new ApiError(400, 'Missing Razorpay webhook signature.', 'MISSING_WEBHOOK_SIGNATURE');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
        throw new ApiError(400, 'Invalid Razorpay webhook signature.', 'INVALID_WEBHOOK_SIGNATURE');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const eventId = payload?.payload?.payment?.entity?.id || payload?.created_at?.toString() || null;
    const eventType = payload?.event;
    const providerOrderId = payload?.payload?.payment?.entity?.order_id;
    const providerPaymentId = payload?.payload?.payment?.entity?.id;

    if (!providerOrderId || !providerPaymentId) {
        res.json({ ok: true, ignored: true, reason: 'No provider order/payment id in webhook payload' });
        return;
    }

    const existing = await prisma.payment.findFirst({
        where: {
            OR: [
                { providerPaymentId } as any,
                ...(eventId ? [{ webhookEventId: eventId } as any] : []),
            ],
        } as any,
    });

    if (existing?.status === 'COMPLETED') {
        res.json({ ok: true, deduplicated: true });
        return;
    }

    const payment = await prisma.payment.findFirst({
        where: { providerOrderId } as any,
        include: { order: true },
    }) as any;

    if (!payment) {
        throw new ApiError(404, 'No local payment record matched this Razorpay webhook.', 'PAYMENT_RECORD_NOT_FOUND', {
            providerOrderId,
            providerPaymentId,
            eventType,
        });
    }

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
        await markPaymentCaptured(payment.id, {
            providerPaymentId,
            providerSignature: signature,
            webhookEventId: eventId || undefined,
            webhookPayload: rawBody.toString('utf8'),
        });
    } else if (eventType?.startsWith('payment.failed')) {
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                provider: 'RAZORPAY',
                providerPaymentId,
                providerSignature: signature,
                webhookEventId: eventId || undefined,
                webhookPayload: rawBody.toString('utf8'),
                webhookReceivedAt: new Date(),
                status: 'FAILED',
                paymentStage: 'PENDING',
                lastError: payload?.payload?.payment?.entity?.error_description || 'Razorpay reported payment failure',
                updatedBy: 'RAZORPAY_WEBHOOK',
            } as any,
        });
    }

    res.json({ ok: true });
}));

// GET pending checkout requests for this cafe's waiters
router.get('/pending', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const cafeId = req.user?.cafeId as string;
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
router.post('/generate-bill/:sessionId', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: any, res: Response) => {
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
router.post('/complete/:sessionId', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: any, res: Response) => {
    const sessionId = req.params.sessionId as string;

    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { orders: true, table: true, cafe: { include: { settings: true } } }
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

    const promotedSession = await activateNextQueuedReservation(session.tableId, session.cafeId);

    res.json({ message: 'Payment complete and session ended', promotedSession });
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
router.post('/acknowledge-payment/:sessionId', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
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
router.post('/complete-payment/:sessionId', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
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
router.post('/send-bill-email/:sessionId', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), asyncHandler(async (req: any, res: Response) => {
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
