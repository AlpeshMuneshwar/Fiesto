import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

import { io } from '../socket';

// Get active orders for Waiter (READY for delivery)
router.get('/active-waiter', authenticate, requireRole(['WAITER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const orders = await prisma.order.findMany({
            where: { 
                cafeId, 
                status: 'READY' 
            },
            include: { session: { include: { table: true } } },
            orderBy: { updatedAt: 'asc' }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch ready orders' });
    }
});

// Waiter marks order as Delivered
router.post('/:id/deliver', authenticate, requireRole(['WAITER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const cafeId = req.user!.cafeId;

        const existingOrder = await prisma.order.findUnique({ where: { id } });
        if (!existingOrder || existingOrder.cafeId !== cafeId) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        if (existingOrder.status !== 'READY') {
            res.status(400).json({ error: 'Order must be in READY status to deliver' });
            return;
        }

        const order = await prisma.order.update({
            where: { id, cafeId },
            data: { status: 'DELIVERED' }
        });

        io.to(existingOrder.sessionId).emit('order_status_update', { orderId: order.id, status: order.status });

        res.json({ message: 'Order marked as delivered', order });
    } catch (error) {
        res.status(500).json({ error: 'Failed to deliver order' });
    }
});

export default router;
