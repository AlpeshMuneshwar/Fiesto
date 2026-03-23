import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Global Stats (Platform Overview)
router.get('/stats', authenticate, requireRole(['SUPER_ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const [totalCafes, totalOrders, totalRevenue, activeSessions] = await Promise.all([
            prisma.cafe.count(),
            prisma.order.count({ where: { status: { notIn: ['REJECTED'] } } }),
            prisma.order.aggregate({
                where: { status: { notIn: ['REJECTED'] } },
                _sum: { totalAmount: true }
            }),
            prisma.session.count({ where: { isActive: true } })
        ]);

        res.json({
            totalCafes,
            totalOrders,
            totalRevenue: totalRevenue._sum.totalAmount || 0,
            activeSessions
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch global stats' });
    }
});

// List all Cafes
router.get('/cafes', authenticate, requireRole(['SUPER_ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafes = await prisma.cafe.findMany({
            include: {
                _count: {
                    select: { orders: true, users: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(cafes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch cafes' });
    }
});

// Toggle Cafe Status (Suspend/Enable)
router.put('/cafes/:id/toggle', authenticate, requireRole(['SUPER_ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const cafe = await prisma.cafe.findUnique({ where: { id } });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        const updated = await prisma.cafe.update({
            where: { id },
            data: { isActive: !cafe.isActive }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle cafe status' });
    }
});

export default router;
