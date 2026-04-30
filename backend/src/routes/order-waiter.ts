import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

import { io } from '../socket';

import { recordActivity } from '../utils/audit';

// Get active orders for Waiter (READY for delivery)
router.get('/active-waiter', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const orders = await prisma.order.findMany({
            where: { 
                cafeId, 
                status: { in: ['READY', 'AWAITING_PICKUP'] }
            },
            include: { session: { include: { table: true } } },
            orderBy: { updatedAt: 'asc' }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch ready orders' });
    }
});

// Chef calls waiter (transitions order from READY to AWAITING_PICKUP)
router.post('/:id/call-waiter', authenticate, requireRole(['CHEF', 'MANAGER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const cafeId = req.user!.cafeId!;
        const staffId = req.user!.id;

        const existingOrder = await prisma.order.findUnique({ 
            where: { id },
            include: { session: { include: { table: true } } }
        });

        if (!existingOrder || existingOrder.cafeId !== cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        if (existingOrder.status !== 'READY') {
            res.status(400).json({ error: 'Order must be in READY status' });
            return;
        }

        const order = await prisma.order.update({
            where: { id, cafeId },
            data: { 
                status: 'AWAITING_PICKUP',
                updatedBy: staffId
            }
        });

        // Emit to waiters to notify them
        io.to('WAITER_' + cafeId).emit('order_waiter_called', {
            orderId: order.id,
            tableNumber: (existingOrder.session as any).table?.number || 'Takeaway',
            tableId: existingOrder.session.tableId,
            sessionId: existingOrder.sessionId,
            message: `Order ready for pickup at ${existingOrder.session.table ? `Table ${existingOrder.session.table.number}` : 'Takeaway'}`
        });

        // Emit to customer
        io.to(existingOrder.sessionId).emit('order_status_update', { 
            orderId: order.id, 
            status: 'AWAITING_PICKUP',
            message: 'Your order is ready! A waiter will bring it shortly.'
        });

        res.json({ message: 'Waiter called successfully', order });
    } catch (error) {
        console.error('Error calling waiter:', error);
        res.status(500).json({ error: 'Failed to call waiter' });
    }
});

// Waiter acknowledges order and is ready to deliver
router.post('/:id/acknowledge-pickup', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const cafeId = req.user!.cafeId!;
        const staffId = req.user!.id;
        const staffRole = req.user!.role;

        const existingOrder = await prisma.order.findUnique({ 
            where: { id },
            include: { session: { include: { table: true } } }
        });

        if (!existingOrder || existingOrder.cafeId !== cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        if (!['AWAITING_PICKUP', 'READY'].includes(existingOrder.status)) {
            res.status(400).json({ error: 'Order is not ready for acknowledgment' });
            return;
        }

        // Keep the order in AWAITING_PICKUP while waiter acknowledges
        // The waiter will then click "Deliver" to mark it as DELIVERED
        const order = await prisma.order.update({
            where: { id, cafeId },
            data: { 
                waiterId: staffId,
                updatedBy: staffId
            }
        });

        io.to(existingOrder.sessionId).emit('order_status_update', { 
            orderId: order.id, 
            status: 'AWAITING_PICKUP',
            message: 'Your order is being picked up by our waiter.'
        });

        res.json({ message: 'Order acknowledged', order });
    } catch (error) {
        console.error('Error acknowledging pickup:', error);
        res.status(500).json({ error: 'Failed to acknowledge order' });
    }
});

// Waiter marks order as Delivered
router.post('/:id/deliver', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const cafeId = req.user!.cafeId!;
        const staffId = req.user!.id;
        const staffRole = req.user!.role;

        const existingOrder = await prisma.order.findUnique({ 
            where: { id },
            include: { session: { include: { table: true } } }
        });

        if (!existingOrder || existingOrder.cafeId !== cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        if (!['AWAITING_PICKUP', 'READY'].includes(existingOrder.status)) {
            res.status(400).json({ error: 'Order must be in READY or AWAITING_PICKUP status to deliver' });
            return;
        }

        const order = await prisma.order.update({
            where: { id, cafeId },
            data: { 
                status: 'DELIVERED',
                waiterId: staffId,
                updatedBy: staffId
            }
        });

        // Audit Log
        recordActivity({
            cafeId,
            staffId,
            role: staffRole,
            actionType: 'ORDER_DELIVERED',
            message: `Order #${id.split('-')[0].toUpperCase()} delivered to ${existingOrder.session.table ? `Table ${existingOrder.session.table.number}` : 'Takeaway'}`,
            metadata: { orderId: id, tableId: existingOrder.session.tableId }
        });

        io.to(existingOrder.sessionId).emit('order_status_update', { 
            orderId: order.id, 
            status: 'DELIVERED',
            message: 'Your order has been delivered!'
        });
        // Emit to Waiter room so all other waiters see it disappear from their "Ready" list
        io.to('WAITER_' + cafeId).emit('order_status_update', { orderId: order.id, status: order.status });
        // Emit to Chef portal to move it to completed
        io.to('CHEF_' + cafeId).emit('order_status_update', { orderId: order.id, status: order.status });

        res.json({ message: 'Order marked as delivered', order });
    } catch (error) {
        console.error('Error delivering order:', error);
        res.status(500).json({ error: 'Failed to deliver order' });
    }
});

export default router;
