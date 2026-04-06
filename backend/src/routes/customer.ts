import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

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
                select: { items: true, totalAmount: true, status: true, isPreorder: true, createdAt: true, orderType: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })) as any[];

    res.json(bookings);
}));

// GET /api/customer/active-code
// Fetch the most recent active pre-booked session code for the user
router.get('/active-code', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const customerId = req.user!.id;

    const activeSession = (await prisma.session.findFirst({
        where: { 
            customerId, 
            isActive: true, 
            isPrebooked: true 
        },
        include: {
            cafe: { select: { name: true } },
            table: { select: { number: true } }
        },
        orderBy: { createdAt: 'desc' }
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
        createdAt: activeSession.createdAt
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
