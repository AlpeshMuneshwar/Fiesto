import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { io } from '../socket';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, sessionStartSchema, sessionJoinSchema, forgotCodeSchema, tableSchema } from '../validators';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

// GET active session for current customer (to resume after fresh launch/refresh)
router.get('/active-customer', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const customerId = req.user!.id;
    const session = await prisma.session.findFirst({
        where: { customerId, isActive: true },
        include: { 
            table: true,
            orders: {
                orderBy: { createdAt: 'desc' }
            }
        }
    });

    if (!session) {
        res.json(null);
        return;
    }

    res.json(session);
}));

// GET all tables and their active session (Waiters/Chefs)
router.get('/tables', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const cafeId = req.user!.cafeId;
    const tables = await prisma.table.findMany({
        where: { cafeId },
        include: {
            sessions: {
                where: { isActive: true },
                take: 1
            }
        }
    });
    res.json(tables);
}));

// Create or update a table and generate its QR code setup (Admin)
router.post('/tables', authenticate, requireRole(['ADMIN']), validate(tableSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { number } = req.body;
    const cafeId = req.user!.cafeId;

    // Use findFirst for scoped uniqueness
    let table = await prisma.table.findFirst({
        where: { cafeId, number }
    });

    const cafe = await prisma.cafe.findUnique({ where: { id: cafeId } });
    if (!cafe) {
        res.status(404).json({ error: 'Cafe not found' });
        return;
    }

    const qrCodeUrl = `https://cafe-qr.local/cafe/${cafe.slug}/table/${number}`;

    if (table) {
        table = await prisma.table.update({
            where: { id: table.id },
            data: { qrCodeUrl }
        });
    } else {
        table = await prisma.table.create({
            data: { cafeId, number, qrCodeUrl }
        });
    }

    // Deactivate old active sessions for this table
    await prisma.session.updateMany({
        where: { tableId: table.id, isActive: true },
        data: { isActive: false }
    });

    res.json(table);
}));

// Customer scans QR and starts an exclusive session
router.post('/start', validate(sessionStartSchema), asyncHandler(async (req: Request, res: Response) => {
    const { cafeId, tableNumber, deviceIdentifier, joinCode } = req.body;

    const table = await prisma.table.findFirst({
        where: { cafeId, number: tableNumber }
    });
    if (!table || !table.isActive) {
        res.status(404).json({ error: 'Table not found or inactive' });
        return;
    }

    const activeSession = await prisma.session.findFirst({
        where: { cafeId, tableId: table.id, isActive: true }
    });

    if (activeSession) {
        // If it's the exact same device returning, allow them back in
        if (activeSession.deviceIdentifier === deviceIdentifier) {
            res.json({ message: 'Welcome back to your session', session: activeSession });
            return;
        } else {
            // Return LOCKED status for other devices
            res.json({
                status: 'LOCKED',
                message: 'This table is occupied. Please enter the session code to join.',
                sessionId: activeSession.id
            });
            return;
        }
    }

    // Start a new session (Requires a joinCode from the first user)
    if (!joinCode) {
        res.status(400).json({ error: 'A join code is required to start a new session.' });
        return;
    }

    const newSession = await prisma.session.create({
        data: {
            cafeId,
            tableId: table.id,
            deviceIdentifier,
            joinCode,
            isActive: true
        }
    });

    res.json({ message: 'Session started successfully', session: newSession });
}));

// Join an existing session via code
router.post('/join', validate(sessionJoinSchema), asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, joinCode, deviceIdentifier } = req.body;

    const session = await prisma.session.findUnique({
        where: { id: sessionId }
    });

    if (!session || !session.isActive) {
        res.status(404).json({ error: 'Session not found or already closed.' });
        return;
    }

    if (session.joinCode !== joinCode) {
        res.status(403).json({ error: 'Invalid join code. Please ask the person who started the session.' });
        return;
    }

    // Successfully joined
    res.json({ message: 'Joined session successfully', session });
}));

// Customer forgets code, notify waiter
router.post('/forgot-code', validate(forgotCodeSchema), asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, cafeId, tableNumber } = req.body;

    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { table: true }
    });

    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    // Notify waiters in this cafe
    const waiterRoom = `WAITER_${cafeId}`;
    io.to(waiterRoom).emit('call_waiter', {
        type: 'FORGOT_CODE',
        message: `Table ${tableNumber} forgot their session code!`,
        sessionId: session.id,
        joinCode: session.joinCode // Waiter can see the code to tell the customer
    });

    res.json({ message: 'Waiter has been notified.' });
}));

// Waiter manually deactivates a 'ghost' or completed session
router.post('/:id/deactivate', authenticate, requireRole(['WAITER', 'ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const cafeId = req.user!.cafeId;

    // Verify session exists and belongs to this cafe
    const existingSession = await prisma.session.findUnique({ where: { id } });
    if (!existingSession || existingSession.cafeId !== cafeId) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    const session = await prisma.session.update({
        where: { id, cafeId },
        data: { isActive: false }
    });

    res.json({ message: 'Session deactivated successfully', session });
}));

// Admin: Delete a table
router.delete('/tables/:id', authenticate, requireRole(['ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const cafeId = req.user!.cafeId;

    // Check table exists and belongs to this cafe
    const table = await prisma.table.findUnique({ where: { id } });
    if (!table || table.cafeId !== cafeId) {
        res.status(404).json({ error: 'Table not found' });
        return;
    }

    // Check if there's an active session
    const active = await prisma.session.findFirst({ where: { tableId: id, isActive: true } });
    if (active) {
        res.status(400).json({ error: 'Cannot delete table with an active session' });
        return;
    }

    await prisma.table.delete({ where: { id, cafeId } });
    res.json({ message: 'Table deleted successfully' });
}));

export default router;
