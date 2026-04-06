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
            tableNumber: (c as any).table?.number || 'Takeaway',
            message: c.message,
            type: c.type,
            timestamp: c.createdAt
        }));

        res.json(formattedCalls);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch active calls' });
    }
});

router.get('/history', authenticate, requireRole(['WAITER', 'ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const staffId = req.user!.id;
        
        // Fetch last 50 acknowledged calls
        const calls = await prisma.staffCall.findMany({
            where: { staffId },
            include: { table: true },
            orderBy: { updatedAt: 'desc' },
            take: 50
        });

        // Fetch last 50 approved/rejected orders
        const orders = await prisma.order.findMany({
            where: { waiterId: staffId },
            include: { session: { include: { table: true } } },
            orderBy: { updatedAt: 'desc' },
            take: 50
        });

        // Normalize data into a single timeline array
        const historyData: any[] = [];
        
        calls.forEach(c => {
            historyData.push({
                type: 'CALL', // Extracted
                callType: c.type, // WAITER_CALL, CHEF_CALL, BILL_REQUEST, etc.
                id: c.id,
                message: c.message,
                status: c.status,
                tableNumber: (c as any).table?.number || 'Takeaway',
                timestamp: c.updatedAt
            });
        });

        orders.forEach(o => {
            historyData.push({
                type: 'ORDER', // Extracted
                id: o.id,
                orderNumber: o.id.split('-')[0].toUpperCase(),
                status: o.status,
                items: o.items, // Ensure UI can expand to show what was delivered
                tableNumber: o.session?.table?.number || '?',
                timestamp: o.updatedAt,
                totalAmount: o.totalAmount
            });
        });

        // Sort combined array descending
        historyData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        res.json(historyData);
    } catch (error) {
        console.error('[Staff History Error]', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

export default router;
