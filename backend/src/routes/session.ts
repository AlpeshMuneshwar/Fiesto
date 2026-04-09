import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { io } from '../socket';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, sessionStartSchema, sessionJoinSchema, forgotCodeSchema, tableSchema } from '../validators';
import { asyncHandler } from '../middleware/error-handler';
import { recordActivity } from '../utils/audit';
import { buildCafeTableUrl } from '../config/runtime';

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

// Create or update a table and generate its QR code setup (Admin & Super Admin)
router.post('/tables', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN']), validate(tableSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { number, desc, capacity } = req.body;
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

    // Generate/Reuse QR Token for security
    const qrToken = crypto.randomUUID();
    const qrCodeUrl = buildCafeTableUrl(cafe.slug, number, qrToken);

    if (table) {
        table = await prisma.table.update({
            where: { id: table.id },
            data: { qrCodeUrl, qrToken, desc, capacity, updatedBy: cafeId } // Admin update
        });
    } else {
        table = await prisma.table.create({
            data: { 
                cafeId, 
                number, 
                qrCodeUrl, 
                qrToken, 
                desc, 
                capacity,
                createdBy: cafeId, 
                updatedBy: cafeId 
            }
        });
    }

    // Audit Log for Table operation
    recordActivity({
        cafeId,
        staffId: req.user?.id,
        role: 'ADMIN',
        actionType: 'SETTINGS_UPDATE',
        message: `${table ? 'Updated' : 'Created'} Table ${number}`,
        metadata: { tableId: table.id, tableNumber: number }
    });

    // Deactivate old active sessions for this table
    await prisma.session.updateMany({
        where: { tableId: table.id, isActive: true },
        data: { isActive: false }
    });

    res.json(table);
}));

// Regenerate QR code for a table (invalidates old QR)
router.post('/tables/:id/regenerate-qr', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const tableId = req.params.id as string;
    const cafeId = req.user!.cafeId;

    const table = await prisma.table.findUnique({ 
        where: { id: tableId },
        include: { cafe: true }
    });

    if (!table || table.cafeId !== cafeId) {
        res.status(404).json({ error: 'Table not found' });
        return;
    }

    // Generate fresh QR token - old one is now dead
    const qrToken = crypto.randomUUID();
    const qrCodeUrl = buildCafeTableUrl(table.cafe.slug, table.number, qrToken);

    const updatedTable = await prisma.table.update({
        where: { id: tableId },
        data: { 
            qrCodeUrl, 
            qrToken,
            updatedBy: cafeId
        }
    });

    // Kill all active sessions on this table (old QR is now invalid)
    await prisma.session.updateMany({
        where: { tableId: table.id, isActive: true },
        data: { isActive: false }
    });

    // Audit Log
    recordActivity({
        cafeId,
        staffId: req.user?.id,
        role: 'ADMIN',
        actionType: 'SETTINGS_UPDATE',
        message: `Regenerated QR for Table ${table.number}`,
        metadata: { tableId }
    });

    res.json({ table: updatedTable });
}));

// Customer scans QR and starts an exclusive session
router.post('/start', validate(sessionStartSchema), asyncHandler(async (req: Request, res: Response) => {
    const { cafeId, tableNumber, qrToken, deviceIdentifier, joinCode } = req.body;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);
    let targetCafeId = cafeId;

    if (!isUuid) {
        const cafe = await prisma.cafe.findUnique({ where: { slug: cafeId } });
        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }
        targetCafeId = cafe.id;
    }

    const table = await prisma.table.findFirst({
        where: { cafeId: targetCafeId, number: tableNumber }
    });
    
    if (!table || !table.isActive) {
        res.status(404).json({ error: 'Table not found or inactive' });
        return;
    }

    // Security: Validate QR Token
    if (table.qrToken !== qrToken) {
        res.status(403).json({ error: 'Invalid or outdated QR code. Please scan the current table QR.' });
        return;
    }

    const activeSession = await prisma.session.findFirst({
        where: { cafeId: targetCafeId, tableId: table.id, isActive: true }
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

    // Start a new session — enforce a join code for security
    if (!joinCode) {
        res.status(400).json({ 
            error: 'A join code is required to start a new session.',
            requiresJoinCode: true 
        });
        return;
    }

    const newSession = await prisma.session.create({
        data: {
            cafeId: targetCafeId,
            tableId: table.id,
            deviceIdentifier,
            joinCode: joinCode,
            isActive: true,
            createdBy: 'CUSTOMER',
            updatedBy: 'CUSTOMER'
        }
    });

    // Audit Log for Session Start
    recordActivity({
        cafeId: targetCafeId,
        actionType: 'SESSION_START',
        message: `New session started at Table ${table.number}`,
        metadata: { sessionId: newSession.id, tableNumber: table.number }
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
        data: { 
            isActive: false,
            updatedBy: req.user?.id
        },
        include: { table: true }
    });

    // Audit Log for manual session closure (Table Cleared)
    recordActivity({
        cafeId,
        staffId: req.user?.id,
        role: req.user?.role,
        actionType: 'SESSION_CLOSE',
        message: `Staff ${req.user?.id} deactivated Session ${id.slice(-8).toUpperCase()}${session.table ? ` (Table ${session.table.number})` : ' (Takeaway)'}`,
        metadata: { sessionId: id, tableNumber: session.table?.number }
    });

    res.json({ message: 'Session deactivated successfully', session });
}));

// Admin: Regenerate QR Token for a table (Invalidates old QR)
router.post('/tables/:id/regenerate-qr', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const cafeId = req.user!.cafeId;

    const table = await prisma.table.findUnique({
        where: { id, cafeId },
        include: { cafe: true }
    });

    if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
    }

    const newQrToken = crypto.randomUUID();
    const newQrCodeUrl = buildCafeTableUrl(table.cafe.slug, table.number, newQrToken);

    const updatedTable = await prisma.table.update({
        where: { id },
        data: {
            qrToken: newQrToken,
            qrCodeUrl: newQrCodeUrl
        }
    });

    // Option: Deactivate any active sessions if QR is changed for security
    // await prisma.session.updateMany({ where: { tableId: id, isActive: true }, data: { isActive: false } });

    res.json({
        message: 'QR Code regenerated successfully. Older QR codes for this table are now invalid.',
        table: updatedTable
    });
}));

// Admin: Delete a table
router.delete('/tables/:id', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
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

// GET single session by ID (for resume/verify) — MUST be LAST to avoid catching /tables, /active-customer
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params.id as string;
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
            table: true,
            orders: { orderBy: { createdAt: 'desc' } }
        }
    });

    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    res.json(session);
}));

export default router;
