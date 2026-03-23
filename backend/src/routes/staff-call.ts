import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get active waiter calls for the cafe
router.get('/active', authenticate, requireRole(['WAITER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const calls = await prisma.staffCall.findMany({
            where: { 
                cafeId, 
                status: 'PENDING' 
            },
            include: { table: true },
            orderBy: { createdAt: 'asc' }
        });

        // Map to format expected by mobile
        const formattedCalls = calls.map(c => ({
            callId: c.id,
            tableId: c.tableId,
            sessionId: c.sessionId,
            tableNumber: c.table.number,
            message: c.message,
            type: c.type,
            timestamp: c.createdAt
        }));

        res.json(formattedCalls);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch active calls' });
    }
});

export default router;
