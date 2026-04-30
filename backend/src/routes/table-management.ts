import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { recordActivity } from '../utils/audit';

const router = Router();

/**
 * GET /api/table-management/status
 * Returns all tables with their active session details (including Join Code/Password)
 */
router.get('/status', authenticate, requireRole(['WAITER', 'CHEF', 'MANAGER', 'ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const cafeId = req.user!.cafeId;
    
    const tables = await prisma.table.findMany({
        where: { cafeId, isActive: true },
        include: {
            sessions: {
                where: { isActive: true },
                select: {
                    id: true,
                    joinCode: true,
                    createdAt: true,
                    customerId: true,
                    deviceIdentifier: true
                },
                take: 1
            }
        },
        orderBy: { number: 'asc' }
    });

    res.json(tables);
}));

/**
 * POST /api/table-management/clear/:tableId
 * Manually end any active sessions on a specific table (e.g., table cleaned)
 */
router.post('/clear/:tableId', authenticate, requireRole(['WAITER', 'MANAGER', 'ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const tableId = req.params.tableId as string;
    const cafeId = req.user!.cafeId;

    const table = await prisma.table.findUnique({
        where: { id: tableId, cafeId }
    });

    if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
    }

    // Deactivate all sessions for this table
    const result = await prisma.session.updateMany({
        where: { tableId, isActive: true },
        data: { 
            isActive: false,
            updatedBy: req.user?.id
        }
    });

    // Audit Log
    recordActivity({
        cafeId,
        staffId: req.user?.id,
        role: req.user?.role,
        actionType: 'TABLE_CLEANED',
        message: `Staff ${req.user?.id} cleared/cleaned Table ${table.number}`,
        metadata: { tableId, tableNumber: table.number, sessionsClosed: result.count }
    });

    res.json({ 
        message: `Table ${table.number} has been cleared.`,
        sessionsClosed: result.count 
    });
}));

export default router;
