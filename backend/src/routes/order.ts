import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { io } from '../socket';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, orderPlaceSchema, orderStatusSchema, orderApprovalSchema } from '../validators';
import { notifyStaffByRole } from '../push';
import { recordActivity } from '../utils/audit';
import {
    getPreorderPaymentWindowMinutes,
    isDirectAdminManagementMode,
    isPreorderType,
    shouldSendToChefApp,
} from '../utils/operational-mode';
import { sendPreorderStatusEmail } from '../utils/email';
import {
    computeAssignedSlot,
    DEFAULT_SESSION_MINUTES,
    getSessionEnd,
    getSessionStart,
    normalizeSlotMinutes,
} from '../utils/reservation-queue';

const router = Router();
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);
const ACTIVE_BOOKING_ORDER_STATUSES = ['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY', 'AWAITING_PICKUP'];

type SlotSession = {
    id: string;
    isActive: boolean;
    isPrebooked: boolean;
    scheduledAt?: Date | null;
    slotDurationMinutes?: number | null;
    createdAt: Date;
    updatedAt: Date;
};

const buildSlotConflictPayload = async (params: {
    cafeId: string;
    tableId: string;
    sessionId: string;
    requestedStart: Date;
    slotMinutes: number;
}) => {
    const sessions = await prisma.session.findMany({
        where: {
            tableId: params.tableId,
            id: { not: params.sessionId },
            OR: [
                { isActive: true },
                {
                    isPrebooked: true,
                    orders: {
                        some: {
                            status: { in: ACTIVE_BOOKING_ORDER_STATUSES },
                        },
                    },
                },
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
    }) as SlotSession[];

    const requestedEnd = addMinutes(params.requestedStart, params.slotMinutes);
    const conflictingSession = sessions.find((session) => {
        const start = getSessionStart(session);
        const end = getSessionEnd(session, params.slotMinutes);
        return params.requestedStart < end && requestedEnd > start;
    }) || null;

    const nextSuggested = computeAssignedSlot(sessions, params.requestedStart, params.slotMinutes);
    const table = await prisma.table.findUnique({
        where: { id: params.tableId },
        select: { id: true, number: true, capacity: true },
    });

    return {
        conflictingSession,
        table,
        nextSuggested,
    };
};

// Place an order (Customer)
router.post('/place', validate(orderPlaceSchema), async (req: Request, res: Response) => {
    try {
        const { sessionId, items, totalAmount, isLocationVerified, specialInstructions } = req.body;

        const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { table: true } });
        if (!session || !session.isActive) {
            res.status(403).json({ error: 'Invalid or inactive session' });
            return;
        }

        const settings = await prisma.cafeSettings.findUnique({ where: { cafeId: session.cafeId } }) || {
            taxEnabled: false, taxRate: 0, taxInclusive: false,
            serviceChargeEnabled: false, serviceChargeRate: 0,
            autoAcceptOrders: false,
            orderRoutingMode: 'STANDARD',
            directAdminChefAppEnabled: false,
        } as any;

        // Server-side validation: fetch true prices from DB to prevent spoofing
        const itemIds = items.map((i: any) => i.id);
        const dbItems = await prisma.menuItem.findMany({
            where: { id: { in: itemIds }, cafeId: session.cafeId }
        });

        const dbItemsMap = new Map(dbItems.map(i => [i.id, i]));

        let calculatedSubtotal = 0;
        const secureItems = items.map((item: any) => {
            const dbItem = dbItemsMap.get(item.id);
            if (!dbItem) throw new Error(`Menu item ${item.name} not found or unavailable.`);

            const truePrice = dbItem.price;
            calculatedSubtotal += truePrice * item.quantity;

            return { ...item, price: truePrice };
        });

        let taxAmount = 0;
        let serviceCharge = 0;
        let calculatedTotal = calculatedSubtotal;

        if ((settings as any).taxEnabled) {
            if ((settings as any).taxInclusive) {
                taxAmount = calculatedSubtotal - (calculatedSubtotal / (1 + ((settings as any).taxRate || 0) / 100));
            } else {
                taxAmount = (calculatedSubtotal * ((settings as any).taxRate || 0)) / 100;
            }
        }

        if ((settings as any).serviceChargeEnabled) {
            serviceCharge = (calculatedSubtotal * ((settings as any).serviceChargeRate || 0)) / 100;
        }

        if ((settings as any).taxInclusive) {
            calculatedTotal = calculatedSubtotal + serviceCharge;
        } else {
            calculatedTotal = calculatedSubtotal + taxAmount + serviceCharge;
        }

        const tolerance = 0.5;
        if (Math.abs(calculatedTotal - totalAmount) > tolerance) {
            res.status(400).json({
                error: 'Total amount mismatch.',
                details: `Expected ${calculatedTotal.toFixed(2)}, got ${totalAmount.toFixed(2)}. Please refresh and try again.`
            });
            return;
        }

        // DIRECT_ADMIN_MANAGEMENT always queues to manager/admin approval.
        // STANDARD mode keeps existing auto-accept/location behavior.
        const directMode = isDirectAdminManagementMode(settings as any);
        let initialStatus = 'PENDING_APPROVAL';
        const locationAgnostic = isLocationVerified || !(settings as any).locationVerification;
        if (!directMode && ((settings as any).autoAcceptOrders || locationAgnostic)) {
            initialStatus = 'RECEIVED';
        }

        const order = await prisma.order.create({
            data: {
                cafeId: session.cafeId,
                sessionId,
                items: JSON.stringify(secureItems),
                subtotal: calculatedSubtotal,
                taxAmount,
                serviceCharge,
                totalAmount: calculatedTotal,
                isLocationVerified,
                status: initialStatus,
                specialInstructions: specialInstructions || null,
                createdBy: 'CUSTOMER',
                updatedBy: 'CUSTOMER'
            } as any
        });

        // Audit Log for Order Placement
        recordActivity({
            cafeId: session.cafeId,
            actionType: 'ORDER_PLACED',
            message: `New order placed for ${session.table ? `Table ${session.table.number}` : 'Takeaway'}`,
            metadata: { orderId: order.id, tableNumber: session.table?.number, amount: calculatedTotal }
        });

        const fullOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { session: { include: { table: true } } }
        });

        if (initialStatus === 'PENDING_APPROVAL') {
            if (directMode) {
                io.to('MANAGER_' + session.cafeId).emit('new_order', fullOrder);
                io.to('ADMIN_' + session.cafeId).emit('new_order', fullOrder);
                notifyStaffByRole(session.cafeId, 'MANAGER', 'New Order Approval', `${session.table ? `Table ${session.table.number}` : 'Takeaway'} placed an order`);
                notifyStaffByRole(session.cafeId, 'ADMIN', 'New Order Approval', `${session.table ? `Table ${session.table.number}` : 'Takeaway'} placed an order`);
            } else {
                io.to('WAITER_' + session.cafeId).emit('new_order', fullOrder);
                io.to('WAITER_' + session.cafeId).emit('call_waiter', {
                    message: `New order pending approval for ${session.table ? `Table ${session.table.number}` : 'Takeaway'}`,
                    tableNumber: session.table?.number,
                    type: 'ORDER_APPROVAL',
                });
                notifyStaffByRole(session.cafeId, 'WAITER', 'New Order', `${session.table ? `Table ${session.table.number}` : 'Takeaway'} placed an order that needs approval`);
                // Standard mode retains chef preview for pending-approval orders.
                io.to('CHEF_' + session.cafeId).emit('new_order', fullOrder);
            }
        } else if (initialStatus === 'RECEIVED' && shouldSendToChefApp(settings as any)) {
            io.to('CHEF_' + session.cafeId).emit('new_order', fullOrder);
            notifyStaffByRole(session.cafeId, 'CHEF', 'New Order', `New order from ${session.table ? `Table ${session.table.number}` : 'Takeaway'}`);
        }

        io.to(sessionId).emit('new_order', order);

        res.status(201).json({
            message: 'Order placed successfully',
            order,
            alert: directMode
                ? 'Direct Admin Management mode is enabled. Your order is sent to manager/admin for approval.'
                : (!isLocationVerified && !(settings as any).autoAcceptOrders)
                    ? 'Your order may take time if location is off to prevent outside ordering.'
                    : null
        });
    } catch (error) {
        console.error('[Order Place Error]', error);
        res.status(500).json({ error: 'Failed to place order' });
    }
});

// Get pending orders for approval queue
router.get('/pending-approval', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const role = req.user!.role;
        const settings = await prisma.cafeSettings.findUnique({ where: { cafeId } });
        const directMode = isDirectAdminManagementMode(settings as any);

        const whereClause: any = { cafeId, status: 'PENDING_APPROVAL' };
        if (role === 'WAITER') {
            if (directMode) {
                res.json([]);
                return;
            }
            whereClause.orderType = 'DINE_IN';
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            include: {
                session: {
                    include: {
                        table: true,
                        customer: {
                            select: { id: true, name: true, email: true, phoneNumber: true },
                        },
                    },
                },
            }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending orders' });
    }
});

// Approver (Waiter/Manager/Admin) approves or rejects an order
router.post('/:id/approve', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), validate(orderApprovalSchema), async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { approve, tableId: requestedTableId, scheduledAt: requestedScheduledAt, bookingDurationMinutes } = req.body;
        const approverId = (req as AuthRequest).user?.id;
        const approverRole = (req as AuthRequest).user?.role || 'WAITER';

        const existingOrder = await prisma.order.findUnique({
            where: { id },
            include: {
                session: {
                    include: {
                        table: true,
                    },
                },
            },
        }) as any;
        if (!existingOrder || existingOrder.cafeId !== (req as AuthRequest).user?.cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        if (existingOrder.status !== 'PENDING_APPROVAL') {
            res.status(400).json({ error: 'Order is not pending approval' });
            return;
        }

        const settings = await prisma.cafeSettings.findUnique({ where: { cafeId: existingOrder.cafeId } });
        const directMode = isDirectAdminManagementMode(settings as any);
        const preorderLike = isPreorderType(existingOrder.orderType, (existingOrder as any).isPreorder);

        const allowedRoles = preorderLike
            ? ['ADMIN', 'MANAGER']
            : directMode
                ? ['ADMIN', 'MANAGER']
                : ['WAITER', 'MANAGER', 'ADMIN'];

        if (!allowedRoles.includes(approverRole)) {
            res.status(403).json({
                error: preorderLike
                    ? 'Only owner/admin or manager can approve preorder/takeaway requests.'
                    : 'This order cannot be approved by your role in the current mode.',
            });
            return;
        }

        const now = new Date();
        const paymentWindowMinutes = getPreorderPaymentWindowMinutes(settings as any);
        const approvalExpiresAt = preorderLike && approve ? addMinutes(now, paymentWindowMinutes) : null;
        const sessionUpdateData: any = {};

        if (preorderLike && approve) {
            const activeSession = existingOrder.session;
            if (!activeSession?.id) {
                res.status(400).json({ error: 'Preorder session is missing.' });
                return;
            }

            const targetTableId = String(requestedTableId || activeSession.tableId || '').trim();
            const targetScheduledAt = requestedScheduledAt
                ? new Date(requestedScheduledAt)
                : new Date(activeSession.scheduledAt || activeSession.createdAt);
            const targetSlotMinutes = normalizeSlotMinutes(bookingDurationMinutes || activeSession.slotDurationMinutes || DEFAULT_SESSION_MINUTES);

            if (!targetTableId) {
                res.status(400).json({ error: 'A table is required before approving this preorder.' });
                return;
            }

            if (Number.isNaN(targetScheduledAt.getTime())) {
                res.status(400).json({ error: 'Enter a valid slot date and time before approval.' });
                return;
            }

            const targetTable = await prisma.table.findFirst({
                where: {
                    id: targetTableId,
                    cafeId: existingOrder.cafeId,
                    isActive: true,
                },
                select: {
                    id: true,
                    number: true,
                    capacity: true,
                },
            });

            if (!targetTable) {
                res.status(404).json({ error: 'Selected table was not found for this cafe.' });
                return;
            }

            const conflict = await buildSlotConflictPayload({
                cafeId: existingOrder.cafeId,
                tableId: targetTableId,
                sessionId: activeSession.id,
                requestedStart: targetScheduledAt,
                slotMinutes: targetSlotMinutes,
            });

            if (conflict.conflictingSession) {
                const conflictingStart = getSessionStart(conflict.conflictingSession);
                const conflictingEnd = getSessionEnd(conflict.conflictingSession, targetSlotMinutes);
                res.status(409).json({
                    error: 'This slot is already occupied. Change the table or time before approving.',
                    code: 'PREORDER_SLOT_OCCUPIED',
                    currentSlot: {
                        tableId: targetTable.id,
                        tableNumber: targetTable.number,
                        scheduledAt: targetScheduledAt,
                        slotDurationMinutes: targetSlotMinutes,
                    },
                    conflictingSlot: {
                        sessionId: conflict.conflictingSession.id,
                        scheduledAt: conflictingStart,
                        endsAt: conflictingEnd,
                    },
                    suggestedSlot: {
                        tableId: targetTable.id,
                        tableNumber: targetTable.number,
                        scheduledAt: conflict.nextSuggested.assignedStart,
                        endsAt: conflict.nextSuggested.assignedEnd,
                        slotDurationMinutes: targetSlotMinutes,
                    },
                });
                return;
            }

            sessionUpdateData.tableId = targetTable.id;
            sessionUpdateData.scheduledAt = targetScheduledAt;
            sessionUpdateData.slotDurationMinutes = targetSlotMinutes;
            sessionUpdateData.updatedBy = approverId;
        }

        const updateResult = await prisma.$transaction(async (tx) => {
            if (Object.keys(sessionUpdateData).length > 0) {
                await tx.session.update({
                    where: { id: existingOrder.sessionId },
                    data: sessionUpdateData,
                });
            }

            return (tx.order as any).updateMany({
                where: { id, status: 'PENDING_APPROVAL' },
                data: {
                    status: approve ? 'RECEIVED' : 'REJECTED',
                    waiterId: approverId,
                    updatedBy: approverId,
                    approvedAt: approve ? now : null,
                    approvalExpiresAt: approve ? approvalExpiresAt : null,
                }
            });
        });

        if (updateResult.count === 0) {
            res.status(400).json({ error: 'Order has already been processed by another staff member.' });
            return;
        }

        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                session: {
                    include: {
                        table: true,
                        customer: {
                            select: { id: true, name: true, email: true, phoneNumber: true },
                        },
                        cafe: {
                            select: { id: true, name: true, contactPhone: true },
                        },
                    },
                },
            },
        });
        if (!order) {
            res.status(404).json({ error: 'Order not found after update' });
            return;
        }

        io.to(existingOrder.sessionId).emit('order_status_update', { orderId: order.id, status: order.status });
        io.to('WAITER_' + existingOrder.cafeId).emit('order_status_update', { orderId: order.id, status: order.status });
        io.to('MANAGER_' + existingOrder.cafeId).emit('order_status_update', { orderId: order.id, status: order.status });
        io.to('ADMIN_' + existingOrder.cafeId).emit('order_status_update', { orderId: order.id, status: order.status });

        if (approve) {
            if (shouldSendToChefApp(settings as any)) {
                io.to('CHEF_' + existingOrder.cafeId).emit('new_order', order);
                io.to('CHEF_' + existingOrder.cafeId).emit('order_status_update', { orderId: order.id, status: order.status });
                notifyStaffByRole(existingOrder.cafeId, 'CHEF', 'Order Approved', 'A new order has been approved and is ready for preparation');
            }

            if (preorderLike && approvalExpiresAt) {
                io.to(existingOrder.sessionId).emit('preorder_approved', {
                    orderId: order.id,
                    approvalExpiresAt,
                    tableId: order.session?.table?.id || null,
                    tableNumber: order.session?.table?.number || null,
                    scheduledAt: order.session?.scheduledAt || null,
                    slotDurationMinutes: order.session?.slotDurationMinutes || DEFAULT_SESSION_MINUTES,
                    message: `Your preorder is approved. Please pay the deposit within ${paymentWindowMinutes} minutes.`,
                });
            }
        } else if (preorderLike) {
            io.to(existingOrder.sessionId).emit('preorder_rejected', {
                orderId: order.id,
                message: 'Your preorder or takeaway request was not approved by the cafe.',
            });
        }

        if (preorderLike && order.session?.customer?.email && order.session?.cafe?.name) {
            sendPreorderStatusEmail({
                to: order.session.customer.email,
                customerName: order.session.customer.name,
                cafeName: order.session.cafe.name,
                cafePhone: (order.session.cafe as any).contactPhone || null,
                orderType: (order.orderType || 'PRE_ORDER') as 'PRE_ORDER' | 'TAKEAWAY',
                approved: approve,
                paymentWindowMinutes: approve ? paymentWindowMinutes : null,
                approvalExpiresAt: approve ? approvalExpiresAt : null,
            }).catch((emailError) => {
                console.error('[ORDER APPROVAL EMAIL ERROR]', emailError);
            });
        }

        recordActivity({
            cafeId: existingOrder.cafeId,
            staffId: approverId,
            role: approverRole,
            actionType: approve ? 'ORDER_APPROVED' : 'ORDER_REJECTED',
            message: `${approverRole} ${approve ? 'approved' : 'rejected'} Order #${id.split('-')[0].toUpperCase()}`,
            metadata: { orderId: id }
        });

        res.json({
            message: `Order ${approve ? 'approved' : 'rejected'}`,
            order,
            paymentWindowEndsAt: approvalExpiresAt,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Chef/Manager/Admin updates order status (PREPARING, READY)
router.post('/:id/status', authenticate, requireRole(['CHEF', 'MANAGER', 'ADMIN']), validate(orderStatusSchema), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { status } = req.body;
        const cafeId = req.user!.cafeId;

        const existingOrder = await prisma.order.findUnique({ where: { id } });
        if (!existingOrder || existingOrder.cafeId !== cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        const updateData: any = { status, updatedBy: req.user?.id };

        if (status === 'PREPARING') {
            if ((existingOrder as any).chefId && (existingOrder as any).chefId !== req.user?.id) {
                res.status(409).json({ error: 'Order is already being prepared by another staff member.' });
                return;
            }
            updateData.chefId = req.user?.id;
        }

        const order = await (prisma.order as any).update({
            where: { id, cafeId },
            data: updateData,
            include: { chef: { select: { name: true } } }
        });

        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: req.user?.role,
            actionType: status === 'PREPARING' ? 'ORDER_PREPARING' : (status === 'READY' ? 'ORDER_READY' : 'ORDER_PLACED'),
            message: `${req.user?.role || 'Staff'} ${req.user?.name || 'Staff'} marked Order #${id.split('-')[0].toUpperCase()} as ${status}`,
            metadata: { orderId: id, status, chefId: req.user?.id }
        });

        io.to(existingOrder.sessionId).emit('order_status_update', {
            orderId: order.id,
            status: order.status,
            chefName: (order as any).chef?.name
        });

        res.json({ message: 'Order status updated', order });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Get active orders for Chef Dashboard
router.get('/active-chef', authenticate, requireRole(['CHEF', 'MANAGER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
        const orders = await (prisma.order as any).findMany({
            where: {
                cafeId,
                OR: [
                    { status: { in: ['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY', 'AWAITING_PICKUP'] } },
                    {
                        status: 'DELIVERED',
                        updatedAt: { gte: twoHoursAgo }
                    }
                ]
            },
            include: {
                session: { include: { table: true } },
                chef: { select: { name: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        const groupedOrders = orders.reduce((acc: any, order: any) => {
            const type = order.orderType || 'DINE_IN';
            if (!acc[type]) acc[type] = [];
            acc[type].push(order);
            return acc;
        }, {});

        res.json({
            orders,
            groupedByType: groupedOrders,
            summary: {
                total: orders.length,
                dineIn: groupedOrders.DINE_IN?.length || 0,
                takeaway: groupedOrders.TAKEAWAY?.length || 0,
                preOrder: groupedOrders.PRE_ORDER?.length || 0
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch active chef orders' });
    }
});

// Get today's history for current Chef
router.get('/chef/history', authenticate, requireRole(['CHEF']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const chefId = req.user!.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const orders = await (prisma.order as any).findMany({
            where: {
                cafeId,
                chefId: chefId as string,
                createdAt: { gte: today }
            },
            include: { session: { include: { table: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch chef history' });
    }
});

export default router;
