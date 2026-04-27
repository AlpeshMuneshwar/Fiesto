import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import {
    DEFAULT_SESSION_MINUTES,
    getSessionEnd,
    getSessionStart,
} from '../utils/reservation-queue';

const router = Router();
const ACTIVE_ORDER_STATUSES = ['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY'];

const resolveReservationStatus = (booking: any) => {
    if (booking.isPrebooked) {
        if (booking.isActive) {
            return booking.deviceIdentifier ? 'CHECKED_IN' : 'READY_FOR_CHECKIN';
        } else {
            const hasCompletedOrder = booking.orders?.some((o: any) => ['COMPLETED', 'CANCELLED'].includes(o.status));
            // A prebooked session is queued if it hasn't started and hasn't been completed
            if (hasCompletedOrder) return 'COMPLETED';
            
            // If no completed order, check if slot has passed by a large margin (e.g., 2 hours). For now, assume it's QUEUED unless it has a terminal order state or if the session is old.
            const isOld = new Date().getTime() - new Date(booking.scheduledAt || booking.createdAt).getTime() > 12 * 60 * 60 * 1000;
            if (isOld) return 'COMPLETED';
            
            return 'QUEUED';
        }
    } else {
        return booking.isActive ? 'ACTIVE' : 'COMPLETED';
    }
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
                select: { id: true, name: true, logoUrl: true, address: true }
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
                    specialInstructions: true
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
                select: { id: true, name: true, logoUrl: true, address: true }
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
                    specialInstructions: true
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
                select: { name: true, logoUrl: true, address: true }
            },
            table: {
                select: { number: true }
            },
            orders: {
                select: { items: true, totalAmount: true, status: true, isPreorder: true, createdAt: true, orderType: true },
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
        };
    }));

    res.json(enrichedBookings);
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
