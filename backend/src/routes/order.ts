import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { io } from '../socket';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, orderPlaceSchema, orderStatusSchema, orderApprovalSchema } from '../validators';
import { notifyStaffByRole } from '../push';
import { recordActivity } from '../utils/audit';

const router = Router();

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
            
            return { ...item, price: truePrice }; // Secure override
        });
        
        let taxAmount = 0;
        let serviceCharge = 0;
        let calculatedTotal = calculatedSubtotal;

        if (settings.taxEnabled) {
            if (settings.taxInclusive) {
                // Formula for internal tax: Total - (Total / (1 + Rate))
                taxAmount = calculatedSubtotal - (calculatedSubtotal / (1 + (settings.taxRate || 0) / 100));
            } else {
                taxAmount = (calculatedSubtotal * (settings.taxRate || 0)) / 100;
            }
        }
        
        if (settings.serviceChargeEnabled) {
            serviceCharge = (calculatedSubtotal * (settings.serviceChargeRate || 0)) / 100;
        }

        if (settings.taxInclusive) {
            calculatedTotal = calculatedSubtotal + serviceCharge; // tax is already inside subtotal
        } else {
            calculatedTotal = calculatedSubtotal + taxAmount + serviceCharge;
        }

        const tolerance = 0.5; // Slightly higher tolerance for floating point precision
        if (Math.abs(calculatedTotal - totalAmount) > tolerance) {
            res.status(400).json({ 
                error: 'Total amount mismatch.', 
                details: `Expected ${calculatedTotal.toFixed(2)}, got ${totalAmount.toFixed(2)}. Please refresh and try again.` 
            });
            return;
        }

        // Status Logic: 
        // 1. If autoAcceptOrders is on, it's RECEIVED immediately.
        // 2. Otherwise, if location is verified OR verification is NOT required, it's RECEIVED.
        // 3. Else, it needs approval (PENDING_APPROVAL).
        let initialStatus = 'PENDING_APPROVAL';
        const locationAgnostic = isLocationVerified || !settings.locationVerification;
        
        if (settings.autoAcceptOrders || locationAgnostic) {
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

        // Re-fetch with includes so all socket listeners get full table/session data
        const fullOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { session: { include: { table: true } } }
        });

        if (initialStatus === 'PENDING_APPROVAL') {
            // Emit full order to WAITER room so their approval panel picks it up
            io.to('WAITER_' + session.cafeId).emit('new_order', fullOrder);
            io.to('WAITER_' + session.cafeId).emit('call_waiter', { 
                message: `New order pending approval for ${session.table ? `Table ${session.table.number}` : 'Takeaway'}`,
                tableNumber: session.table?.number,
                type: 'ORDER_APPROVAL',
            });
            notifyStaffByRole(session.cafeId, 'WAITER', '🔔 New Order', `${session.table ? `Table ${session.table.number}` : 'Takeaway'} placed an order that needs approval`);
            // Emit to chef too so they see the greyed-out pending order and hear the ding!
            io.to('CHEF_' + session.cafeId).emit('new_order', fullOrder);
        } else if (initialStatus === 'RECEIVED') {
            io.to('CHEF_' + session.cafeId).emit('new_order', fullOrder);
            notifyStaffByRole(session.cafeId, 'CHEF', '🍳 New Order', `New order from ${session.table ? `Table ${session.table.number}` : 'Takeaway'}`);
        }

        // Broadcast to the entire customer table to sync their screens
        io.to(sessionId).emit('new_order', order);

        res.status(201).json({
            message: 'Order placed successfully',
            order,
            alert: (!isLocationVerified && !settings.autoAcceptOrders) ? 'Your order may take time if location is off to prevent outside ordering.' : null
        });
    } catch (error) {
        console.error('[Order Place Error]', error);
        res.status(500).json({ error: 'Failed to place order' });
    }
});

// Get pending orders for Waiter approval
router.get('/pending-approval', authenticate, requireRole(['WAITER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const orders = await prisma.order.findMany({
            where: { cafeId, status: 'PENDING_APPROVAL' },
            include: { session: { include: { table: true } } }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending orders' });
    }
});

// Waiter approves or rejects an order
router.post('/:id/approve', authenticate, requireRole(['WAITER', 'ADMIN']), validate(orderApprovalSchema), async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { approve } = req.body;
        const waiterId = (req as AuthRequest).user?.id;

        // Verify order exists and belongs to this cafe
        const existingOrder = await prisma.order.findUnique({ where: { id } });
        if (!existingOrder || existingOrder.cafeId !== (req as AuthRequest).user?.cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        if (existingOrder.status !== 'PENDING_APPROVAL') {
            res.status(400).json({ error: 'Order is not pending approval' });
            return;
        }

        const updateResult = await (prisma.order as any).updateMany({
            where: { id, status: 'PENDING_APPROVAL' },
            data: {
                status: approve ? 'RECEIVED' : 'REJECTED',
                waiterId,
                updatedBy: waiterId
            }
        });
        
        if (updateResult.count === 0) {
            res.status(400).json({ error: 'Order has already been processed by another waiter.' });
            return;
        }

        const order = await prisma.order.findUnique({ where: { id } });
        if (!order) return;

        io.to(existingOrder.sessionId).emit('order_status_update', { orderId: order.id, status: order.status });
        io.to('WAITER_' + existingOrder.cafeId).emit('order_status_update', { orderId: order.id, status: order.status });
        
        if (approve) {
            // Chef already has this order in PENDING_APPROVAL state. Just update it.
            io.to('CHEF_' + existingOrder.cafeId).emit('order_status_update', { orderId: order.id, status: order.status });
            notifyStaffByRole(existingOrder.cafeId, 'CHEF', '🍳 Order Approved', 'A new order has been approved and is ready for preparation');
        }

        // Audit Log for Approval/Rejection
        recordActivity({
            cafeId: existingOrder.cafeId,
            staffId: waiterId,
            role: 'WAITER',
            actionType: approve ? 'ORDER_APPROVED' : 'ORDER_REJECTED',
            message: `Waiter ${approve ? 'approved' : 'rejected'} Order #${id.split('-')[0].toUpperCase()}`,
            metadata: { orderId: id }
        });

        res.json({ message: `Order ${approve ? 'approved' : 'rejected'}`, order });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Chef updates order status (PREPARING, READY)
router.post('/:id/status', authenticate, requireRole(['CHEF', 'ADMIN']), validate(orderStatusSchema), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { status } = req.body;
        const cafeId = req.user!.cafeId;

        // Verify order exists and belongs to this cafe
        const existingOrder = await prisma.order.findUnique({ where: { id } });
        if (!existingOrder || existingOrder.cafeId !== cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        const updateData: any = { status, updatedBy: req.user?.id };
        
        // Logical Enforcement: Assign Order to specific chef if they start it
        if (status === 'PREPARING') {
            if ((existingOrder as any).chefId && (existingOrder as any).chefId !== req.user?.id) {
                res.status(409).json({ error: 'Order is already being prepared by another chef.' });
                return;
            }
            updateData.chefId = req.user?.id;
        }

        const order = await (prisma.order as any).update({
            where: { id, cafeId },
            data: updateData,
            include: { chef: { select: { name: true } } }
        });

        // Audit Log for Status Update
        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: 'CHEF',
            actionType: status === 'PREPARING' ? 'ORDER_PREPARING' : (status === 'READY' ? 'ORDER_READY' : 'ORDER_PLACED'),
            message: `Chef ${req.user?.name || 'Staff'} marked Order #${id.split('-')[0].toUpperCase()} as ${status}`,
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

// DELIVERY LOGIC MOVED TO order-waiter.ts

// Get active orders for Chef Dashboard
router.get('/active-chef', authenticate, requireRole(['CHEF', 'ADMIN']), async (req: AuthRequest, res: Response) => {
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

        // Group orders by type for better display
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
