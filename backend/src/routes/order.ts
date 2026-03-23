import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { io } from '../socket';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, orderPlaceSchema, orderStatusSchema, orderApprovalSchema } from '../validators';
import { notifyStaffByRole } from '../push';

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

        // Server-side validation: recalculate total from items
        const calculatedSubtotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
        
        let taxAmount = 0;
        let serviceCharge = 0;
        let calculatedTotal = calculatedSubtotal;

        if (settings.taxEnabled) {
            taxAmount = (calculatedSubtotal * settings.taxRate) / 100;
        }
        if (settings.serviceChargeEnabled) {
            serviceCharge = (calculatedSubtotal * settings.serviceChargeRate) / 100;
        }

        if (settings.taxInclusive) {
            calculatedTotal = calculatedSubtotal + serviceCharge; // tax is already inside subtotal
        } else {
            calculatedTotal = calculatedSubtotal + taxAmount + serviceCharge;
        }

        const tolerance = 0.05; // Mismatch tolerance
        if (Math.abs(calculatedTotal - totalAmount) > tolerance) {
            res.status(400).json({ error: 'Total amount mismatch. Please refresh and try again.' });
            return;
        }

        let initialStatus = isLocationVerified ? 'RECEIVED' : 'PENDING_APPROVAL';
        if (settings.autoAcceptOrders) {
            initialStatus = 'RECEIVED';
        }

        const order = await prisma.order.create({
            data: {
                cafeId: session.cafeId,
                sessionId,
                items: JSON.stringify(items),
                subtotal: calculatedSubtotal,
                taxAmount,
                serviceCharge,
                totalAmount: calculatedTotal,
                isLocationVerified,
                status: initialStatus,
                specialInstructions: specialInstructions || null,
            }
        });

        if (initialStatus === 'PENDING_APPROVAL') {
            io.to('WAITER_' + session.cafeId).emit('call_waiter', { message: `New order pending approval for Table ${session.table.number}` });
            notifyStaffByRole(session.cafeId, 'WAITER', '🔔 New Order', `Table ${session.table.number} placed an order that needs approval`);
        } else if (initialStatus === 'RECEIVED') {
            io.to('CHEF_' + session.cafeId).emit('new_order', order);
            notifyStaffByRole(session.cafeId, 'CHEF', '🍳 New Order', `New order from Table ${session.table.number}`);
        }

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

        const order = await prisma.order.update({
            where: { id },
            data: {
                status: approve ? 'RECEIVED' : 'REJECTED',
                waiterId
            }
        });

        io.to(existingOrder.sessionId).emit('order_status_update', { orderId: order.id, status: order.status });
        if (approve) {
            io.to('CHEF_' + existingOrder.cafeId).emit('new_order', order);
            notifyStaffByRole(existingOrder.cafeId, 'CHEF', '🍳 Order Approved', 'A new order has been approved and is ready for preparation');
        }

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

        const order = await prisma.order.update({
            where: { id, cafeId },
            data: { status }
        });

        io.to(existingOrder.sessionId).emit('order_status_update', { orderId: order.id, status: order.status });

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
        const orders = await prisma.order.findMany({
            where: { cafeId, status: { in: ['RECEIVED', 'PREPARING', 'READY'] } },
            include: { session: { include: { table: true } } },
            orderBy: { createdAt: 'asc' }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch active chef orders' });
    }
});

export default router;
