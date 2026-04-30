import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { validate, customerOrderEditSchema } from '../validators';
import {
    DEFAULT_SESSION_MINUTES,
    getSessionEnd,
    getSessionStart,
} from '../utils/reservation-queue';
import { platformReservationDefaults } from '../config/reservation-defaults';

const router = Router();
const ACTIVE_ORDER_STATUSES = ['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY'];
const EDITABLE_ORDER_TYPES = ['PRE_ORDER', 'TAKEAWAY'];
const TERMINAL_ORDER_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'];
const ACTIVE_RESERVATION_STATUSES = ['QUEUED', 'READY_FOR_CHECKIN', 'CHECKED_IN', 'ACTIVE'];
const ACTIVE_APPROVAL_DISPLAY_STATUSES = ['AWAITING_APPROVAL', 'APPROVED_PAYMENT_PENDING', 'APPROVED_PAYMENT_EXPIRED', 'APPROVED_PAYMENT_COMPLETED'];

const parseOrderItems = (items: string) => {
    try {
        const parsed = JSON.parse(items || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const resolveReservationStatus = (booking: any) => {
    if (booking.isPrebooked) {
        const slotDurationMinutes = booking.slotDurationMinutes || DEFAULT_SESSION_MINUTES;
        const slotEnd = getSessionEnd({
            id: booking.id,
            isActive: booking.isActive,
            isPrebooked: booking.isPrebooked,
            scheduledAt: booking.scheduledAt,
            slotDurationMinutes: booking.slotDurationMinutes,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt,
        } as any, slotDurationMinutes);
        const slotHasPassed = slotEnd.getTime() < Date.now();
        const hasTerminalOrder = booking.orders?.some((o: any) => TERMINAL_ORDER_STATUSES.includes(o.status));

        if (!booking.isActive && booking.deviceIdentifier) {
            return 'COMPLETED';
        }

        if (hasTerminalOrder && !booking.isActive) {
            return 'COMPLETED';
        }

        if (!booking.deviceIdentifier && slotHasPassed) {
            return 'MISSED';
        }

        if (booking.isActive) {
            return booking.deviceIdentifier ? 'CHECKED_IN' : 'READY_FOR_CHECKIN';
        }

        return 'QUEUED';
    } else {
        return booking.isActive ? 'ACTIVE' : 'COMPLETED';
    }
};

const resolveCustomerBookingBucket = (params: {
    booking: any;
    latestOrder: any;
    reservationStatus: string;
    approvalDisplayStatus: string | null;
}) => {
    const { booking, latestOrder, reservationStatus, approvalDisplayStatus } = params;

    if (ACTIVE_RESERVATION_STATUSES.includes(reservationStatus)) {
        return 'ACTIVE';
    }

    if (ACTIVE_APPROVAL_DISPLAY_STATUSES.includes(approvalDisplayStatus || '')) {
        return 'ACTIVE';
    }

    if (ACTIVE_ORDER_STATUSES.includes(latestOrder?.status || '')) {
        return 'ACTIVE';
    }

    if (booking?.isPrebooked && reservationStatus !== 'MISSED' && latestOrder?.status === 'REJECTED') {
        return 'PAST';
    }

    return 'PAST';
};

// GET /api/customer/dashboard
// Comprehensive customer dashboard with active orders, past orders, and session info
router.get('/dashboard', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const customerId = req.user!.id;

    // Get active sessions (dine-in, pre-orders, takeaway)
    const activeSessions = (await prisma.session.findMany({
        where: {
            customerId,
            isActive: true
        },
        include: {
            cafe: {
                select: { id: true, name: true, logoUrl: true, address: true, contactPhone: true }
            },
            table: {
                select: { number: true }
            },
            orders: {
                select: {
                    id: true,
                    status: true,
                    orderType: true,
                    items: true,
                    totalAmount: true,
                    advancePaid: true,
                    createdAt: true,
                    specialInstructions: true,
                    approvedAt: true,
                    approvalExpiresAt: true,
                    payment: {
                        select: { status: true, amount: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }
        },
        orderBy: { createdAt: 'desc' }
    })) as any[];

    // Get past orders (completed sessions)
    const pastOrders = (await prisma.session.findMany({
        where: {
            customerId,
            isActive: false
        },
        include: {
            cafe: {
                select: { id: true, name: true, logoUrl: true, address: true, contactPhone: true }
            },
            table: {
                select: { number: true }
            },
            orders: {
                select: {
                    id: true,
                    status: true,
                    orderType: true,
                    items: true,
                    totalAmount: true,
                    advancePaid: true,
                    createdAt: true,
                    specialInstructions: true,
                    approvedAt: true,
                    approvalExpiresAt: true,
                    payment: {
                        select: { status: true, amount: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 20 // Last 20 completed sessions
    })) as any[];

    // Calculate order ranks for active orders
    const activeOrdersWithRank = activeSessions.flatMap((session: any) =>
        session.orders.map((order: any) => {
            // Get all orders in the same cafe with same status to calculate rank
            const sameStatusOrders = session.orders.filter((o: any) => o.status === order.status);
            const rank = sameStatusOrders.findIndex((o: any) => o.id === order.id) + 1;

            return {
                ...order,
                sessionId: session.id,
                joinCode: session.joinCode,
                tableNumber: session.table?.number,
                cafe: session.cafe,
                orderRank: rank,
                totalOrdersInQueue: sameStatusOrders.length
            };
        })
    );

    // Format past orders
    const formattedPastOrders = pastOrders.flatMap((session: any) =>
        session.orders.map((order: any) => ({
            ...order,
            sessionId: session.id,
            tableNumber: session.table?.number,
            cafe: session.cafe,
            completedAt: session.updatedAt
        }))
    );

    res.json({
        activeOrders: activeOrdersWithRank,
        pastOrders: formattedPastOrders,
        activeSessions: activeSessions.map((session: any) => ({
            id: session.id,
            joinCode: session.joinCode,
            tableNumber: session.table?.number,
            cafe: session.cafe,
            isPrebooked: session.isPrebooked,
            scheduledAt: session.scheduledAt,
            orderCount: session.orders.length
        }))
    });
}));

// GET /api/customer/bookings
// Fetch all sessions (active and past) for the logged-in customer
router.get('/bookings', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const customerId = req.user!.id;

    const bookings = (await prisma.session.findMany({
        where: { customerId },
        include: {
            cafe: {
                select: { id: true, name: true, logoUrl: true, address: true, contactPhone: true }
            },
            table: {
                select: { number: true }
            },
            orders: {
                select: {
                    id: true,
                    items: true,
                    totalAmount: true,
                    status: true,
                    isPreorder: true,
                    createdAt: true,
                    orderType: true,
                    specialInstructions: true,
                    approvedAt: true,
                    approvalExpiresAt: true,
                    payment: {
                        select: { status: true, amount: true }
                    },
                },
                orderBy: { createdAt: 'desc' }
            }
        },
        orderBy: { createdAt: 'desc' }
    })) as any[];

    const enrichedBookings = await Promise.all(bookings.map(async (booking: any) => {
        const reservationStatus = resolveReservationStatus(booking);
        const slotDurationMinutes = booking.slotDurationMinutes || (booking.isPrebooked ? DEFAULT_SESSION_MINUTES : null);
        const slotStartAt = getSessionStart({
            id: booking.id,
            isActive: booking.isActive,
            isPrebooked: booking.isPrebooked,
            scheduledAt: booking.scheduledAt,
            slotDurationMinutes: booking.slotDurationMinutes,
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt,
        } as any);
        const slotEndAt = booking.isPrebooked
            ? getSessionEnd({
                id: booking.id,
                isActive: booking.isActive,
                isPrebooked: booking.isPrebooked,
                scheduledAt: booking.scheduledAt,
                slotDurationMinutes: booking.slotDurationMinutes,
                createdAt: booking.createdAt,
                updatedAt: booking.updatedAt,
            } as any, slotDurationMinutes || DEFAULT_SESSION_MINUTES)
            : null;

        let queuePosition = 0;
        let queueAhead = 0;
        let minutesUntilStart = booking.isPrebooked
            ? Math.max(0, Math.ceil((new Date(slotStartAt).getTime() - Date.now()) / 60000))
            : null;

        if (booking.isPrebooked && booking.tableId && reservationStatus === 'QUEUED') {
            const tableSessions = await prisma.session.findMany({
                where: {
                    tableId: booking.tableId,
                    OR: [
                        { isActive: true },
                        { isPrebooked: true },
                    ],
                },
                select: {
                    id: true,
                    isActive: true,
                    isPrebooked: true,
                    scheduledAt: true,
                    slotDurationMinutes: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
            });

            const sorted = tableSessions
                .map((entry: any) => ({
                    ...entry,
                    start: getSessionStart(entry),
                }))
                .sort((a: any, b: any) => {
                    if (a.start.getTime() === b.start.getTime()) {
                        return a.createdAt.getTime() - b.createdAt.getTime();
                    }
                    return a.start.getTime() - b.start.getTime();
                });

            const currentIndex = sorted.findIndex((entry: any) => entry.id === booking.id);
            queueAhead = currentIndex > 0 ? currentIndex : 0;
            queuePosition = currentIndex >= 0 ? currentIndex + 1 : 0;
            minutesUntilStart = Math.max(0, Math.ceil((new Date(slotStartAt).getTime() - Date.now()) / 60000));
        }

        const latestOrder = booking.orders?.[0] || null;
        let orderQueueRank = 0;
        if (latestOrder && latestOrder.orderType === 'TAKEAWAY' && ACTIVE_ORDER_STATUSES.includes(latestOrder.status)) {
            orderQueueRank = await prisma.order.count({
                where: {
                    cafeId: booking.cafeId,
                    orderType: { in: ['TAKEAWAY', 'PRE_ORDER'] },
                    status: { in: ACTIVE_ORDER_STATUSES },
                    createdAt: { lte: latestOrder.createdAt },
                },
            });
        }

        const bookingType = latestOrder?.orderType || (booking.isPrebooked ? 'PRE_ORDER' : 'DINE_IN');
        const canEditPendingOrder = Boolean(
            latestOrder
            && EDITABLE_ORDER_TYPES.includes(bookingType)
            && latestOrder.status === 'PENDING_APPROVAL'
        );
        const paymentDeadlineAt = latestOrder?.approvalExpiresAt || null;
        const paymentExpired = Boolean(
            latestOrder
            && latestOrder.status === 'RECEIVED'
            && latestOrder.payment?.status !== 'COMPLETED'
            && paymentDeadlineAt
            && new Date(paymentDeadlineAt).getTime() <= Date.now()
        );
        const canPayDeposit = Boolean(
            latestOrder
            && EDITABLE_ORDER_TYPES.includes(bookingType)
            && latestOrder.status === 'RECEIVED'
            && latestOrder.payment?.status !== 'COMPLETED'
            && !paymentExpired
        );

        let approvalDisplayStatus: string | null = null;
        let paymentNotice: string | null = null;

        if (latestOrder && EDITABLE_ORDER_TYPES.includes(bookingType)) {
            if (latestOrder.status === 'PENDING_APPROVAL') {
                approvalDisplayStatus = 'AWAITING_APPROVAL';
                paymentNotice = 'Awaiting owner or manager approval. Deposit payment opens after approval.';
            } else if (latestOrder.status === 'RECEIVED' && latestOrder.payment?.status !== 'COMPLETED') {
                if (paymentExpired) {
                    approvalDisplayStatus = 'APPROVED_PAYMENT_EXPIRED';
                    paymentNotice = 'Payment window expired. Call the restaurant to reopen the deposit window.';
                } else {
                    approvalDisplayStatus = 'APPROVED_PAYMENT_PENDING';
                    paymentNotice = `Approved. Pay the deposit within ${platformReservationDefaults.preorderPaymentWindowMinutes} minutes.`;
                }
            } else if (latestOrder.payment?.status === 'COMPLETED') {
                approvalDisplayStatus = 'APPROVED_PAYMENT_COMPLETED';
                paymentNotice = 'Deposit paid. The cafe will prepare this booking for your selected time.';
            } else if (latestOrder.status === 'REJECTED') {
                approvalDisplayStatus = 'REJECTED';
                paymentNotice = 'This booking request was not approved by the cafe.';
            }
        }

        const customerViewBucket = resolveCustomerBookingBucket({
            booking,
            latestOrder,
            reservationStatus,
            approvalDisplayStatus,
        });

        return {
            ...booking,
            reservationStatus,
            bookingType,
            slotStartAt,
            slotEndAt,
            slotDurationMinutes,
            queuePosition,
            queueAhead,
            minutesUntilStart,
            orderQueueRank,
            latestOrder: latestOrder
                ? {
                    ...latestOrder,
                    parsedItems: parseOrderItems(latestOrder.items),
                }
                : null,
            canEditPendingOrder,
            canPayDeposit,
            approvalStatus: latestOrder?.status || null,
            approvalDisplayStatus,
            paymentNotice,
            paymentWindowMinutes: platformReservationDefaults.preorderPaymentWindowMinutes,
            paymentDeadlineAt,
            paymentExpired,
            customerViewBucket,
        };
    }));

    res.json(enrichedBookings);
}));

// PUT /api/customer/orders/:orderId
// Allow customers to edit preorder/takeaway items only before owner/manager approval.
router.put('/orders/:orderId', authenticate, validate(customerOrderEditSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
    const customerId = req.user!.id;
    const orderId = req.params.orderId as string;
    const { items, specialInstructions } = req.body;

    const existingOrder = await prisma.order.findFirst({
        where: {
            id: orderId,
            session: {
                customerId,
            },
        },
        include: {
            session: {
                select: {
                    customerId: true,
                    cafeId: true,
                },
            },
            payment: true,
        },
    }) as any;

    if (!existingOrder) {
        res.status(404).json({ error: 'Order not found.' });
        return;
    }

    if (!EDITABLE_ORDER_TYPES.includes(existingOrder.orderType || '')) {
        res.status(400).json({ error: 'Only preorder and takeaway orders can be edited here.' });
        return;
    }

    if (existingOrder.status !== 'PENDING_APPROVAL') {
        res.status(409).json({ error: 'This order is already approved or processed and can no longer be edited.' });
        return;
    }

    const menuItems = await prisma.menuItem.findMany({
        where: {
            cafeId: existingOrder.cafeId,
            id: { in: items.map((item: any) => item.id) },
            isActive: true,
        },
    });

    const menuItemsMap = new Map(menuItems.map((item) => [item.id, item]));
    let subtotal = 0;

    const secureItems = items.map((item: any) => {
        const menuItem = menuItemsMap.get(item.id);
        if (!menuItem) {
            throw new Error(`Menu item not found: ${item.id}`);
        }

        subtotal += menuItem.price * item.quantity;
        return {
            id: menuItem.id,
            name: menuItem.name,
            quantity: item.quantity,
            price: menuItem.price,
        };
    });

    const platformFee = Number(existingOrder.platformFee || platformReservationDefaults.platformFeeAmount || 0);
    const advancePaid = (subtotal * Number(platformReservationDefaults.preOrderAdvanceRate || 0)) / 100;
    const payableAmount = advancePaid + platformFee;

    const updatedOrder = await prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
            where: { id: orderId },
            data: {
                items: JSON.stringify(secureItems),
                specialInstructions: specialInstructions?.trim() || null,
                subtotal,
                totalAmount: subtotal,
                advancePaid,
                updatedBy: customerId,
            },
            include: {
                payment: true,
            },
        });

        if (order.payment) {
            await tx.payment.update({
                where: { id: order.payment.id },
                data: {
                    amount: payableAmount,
                    updatedBy: customerId,
                } as any,
            });
        }

        return order;
    });

    res.json({
        message: 'Pending order updated successfully.',
        order: {
            ...updatedOrder,
            parsedItems: secureItems,
        },
    });
}));

// POST /api/customer/bookings/:sessionId/cancel
// Cancel an active booking (queued or pending)
router.post('/bookings/:sessionId/cancel', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessionId = req.params.sessionId as string;
    const customerId = req.user!.id;

    const session = await prisma.session.findFirst({
        where: { id: sessionId, customerId },
        include: { orders: true }
    });

    if (!session) {
        res.status(404).json({ error: 'Booking not found' });
        return;
    }

    if (!session.isActive && !session.isPrebooked) {
        res.status(400).json({ error: 'Booking is already completed or inactive.' });
        return;
    }

    // Mark session as inactive
    await prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false, updatedBy: customerId }
    });

    // Mark any active orders as CANCELLED
    const ordersToCancel = session.orders.filter((o: any) => ['PENDING_APPROVAL', 'RECEIVED'].includes(o.status));
    for (const order of ordersToCancel) {
        await prisma.order.update({
            where: { id: order.id },
            data: { status: 'CANCELLED', updatedBy: customerId }
        });
    }

    // Optional: Emit socket event to cafe
    // io.to(`CAFE_${session.cafeId}`).emit('booking_cancelled', { sessionId });

    res.json({ message: 'Booking cancelled successfully.' });
}));

// GET /api/customer/active-code
// Fetch the most recent active or queued pre-booked session code for the user
router.get('/active-code', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const customerId = req.user!.id;

    const activeSession = (await prisma.session.findFirst({
        where: { 
            customerId, 
            isPrebooked: true 
        },
        include: {
            cafe: { select: { name: true } },
            table: { select: { number: true } }
        },
        orderBy: [
            { isActive: 'desc' },
            { scheduledAt: 'asc' },
            { createdAt: 'desc' }
        ]
    })) as any;

    if (!activeSession) {
        res.json(null);
        return;
    }

    res.json({
        sessionId: activeSession.id,
        joinCode: activeSession.joinCode,
        cafeName: activeSession.cafe.name,
        tableNumber: activeSession.table?.number,
        slotStartAt: activeSession.scheduledAt || activeSession.createdAt,
        slotDurationMinutes: activeSession.slotDurationMinutes || DEFAULT_SESSION_MINUTES,
        slotEndAt: activeSession.scheduledAt
            ? new Date(new Date(activeSession.scheduledAt).getTime() + ((activeSession.slotDurationMinutes || DEFAULT_SESSION_MINUTES) * 60000))
            : null,
        createdAt: activeSession.createdAt,
        reservationStatus: resolveReservationStatus(activeSession),
    });
}));

// GET /api/customer/order/:orderId/receipt
// Get receipt for a specific order
router.get('/order/:orderId/receipt', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId } = req.params;
    const customerId = req.user!.id;

    const order = (await prisma.order.findFirst({
        where: {
            id: orderId as string,
            session: {
                customerId
            }
        },
        include: {
            session: {
                include: {
                    cafe: {
                        include: { settings: true }
                    },
                    table: true
                }
            },
            payment: true
        }
    })) as any;

    if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
    }

    const items = JSON.parse(order.items);
    const cafe = order.session.cafe;
    const settings = cafe.settings;

    const receipt = {
        orderId: order.id,
        sessionId: order.session.id.slice(-8).toUpperCase(),
        cafeName: cafe.name,
        cafeAddress: cafe.address,
        logoUrl: cafe.logoUrl,
        gstNumber: settings?.gstNumber,
        tableNumber: order.session.table?.number,
        orderType: order.orderType,
        items,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        serviceCharge: order.serviceCharge,
        totalAmount: order.totalAmount,
        advancePaid: order.advancePaid,
        currencySymbol: settings?.currencySymbol || '₹',
        date: order.createdAt,
        paymentStatus: order.payment?.status || 'PENDING'
    };

    res.json(receipt);
}));

export default router;
