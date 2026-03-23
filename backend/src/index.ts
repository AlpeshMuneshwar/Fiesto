import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import dotenv from 'dotenv';

// Load env vars BEFORE anything else
dotenv.config();

// Fail-fast: ensure critical env vars are set
if (!process.env.JWT_SECRET) {
    console.error('\n❌ FATAL: JWT_SECRET environment variable is not set!');
    console.error('   Set it in .env or as an environment variable.\n');
    process.exit(1);
}

import { prisma } from './prisma';
import { initSocket } from './socket';

const app = express();
const httpServer = createServer(app);
const io = initSocket(httpServer);

// ==========================================
// Security Middleware
// ==========================================

// Helmet: Sets various HTTP security headers
app.use(helmet({
    contentSecurityPolicy: false, // Disabled for API servers
    crossOriginEmbedderPolicy: false,
}));

// CORS: Strict origin allowlist from environment
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:8081', 'http://localhost:8082'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate Limiting: Global — 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
    skip: (req) => req.path === '/api/health', // Don't rate-limit health checks
});
app.use(globalLimiter);

// Stricter rate limiter for auth routes (login, register)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // Only 20 auth attempts per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
});

// Body parser with size limit to prevent oversized payloads
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ==========================================
// Routes
// ==========================================

import authRouter from './routes/auth';
import sessionRouter from './routes/session';
import orderRouter from './routes/order';
import orderWaiterRoutes from './routes/order-waiter';
import paymentRoutes from './routes/payment';
import staffCallRoutes from './routes/staff-call';
import menuRouter from './routes/menu';
import adminRouter from './routes/admin';
import tenantRouter from './routes/tenant';
import superAdminRouter from './routes/super-admin';
import settingsRouter from './routes/settings';
import discoverRouter from './routes/discover';
import reservationRouter from './routes/reservation';

// Serve receipt uploads publicly
app.use('/uploads', express.static(process.cwd() + '/uploads'));

// Basic health route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});

// Apply stricter rate limiter to auth routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/tenant', authLimiter, tenantRouter);

// Standard routes
app.use('/api/session', sessionRouter);
app.use('/api/order', orderRouter);
app.use('/api/order-waiter', orderWaiterRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/staff-call', staffCallRoutes);
app.use('/api/menu', menuRouter);
app.use('/api/admin', adminRouter);
app.use('/api/super-admin', superAdminRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/discover', discoverRouter);
app.use('/api/reservation', reservationRouter);

// ==========================================
// Global Error Handler
// ==========================================

import { globalErrorHandler } from './middleware/error-handler';
app.use(globalErrorHandler);

// ==========================================
// Socket.IO Connection Handling
// ==========================================

io.on('connection', (socket) => {
    const userData = (socket as any).userData;
    console.log(`User connected: ${socket.id} (${userData?.role || 'unknown'})`);

    socket.on('join_room', (data: { room: string; role: string }) => {
        // Validate that staff users can only join rooms for their cafe
        if (userData && userData.cafeId && data.room) {
            // Staff should only join rooms related to their cafe
            if (data.role !== 'CUSTOMER' && !data.room.includes(userData.cafeId)) {
                console.warn(`Socket ${socket.id} tried to join unauthorized room ${data.room}`);
                return;
            }
        }
        socket.join(data.room);
        console.log(`Socket ${socket.id} joined room ${data.room} as ${data.role}`);
    });

    socket.on('call_waiter', async (data: { room: string; message: string; type?: string; cafeId: string; tableId: string; sessionId: string; tableNumber?: number }) => {
        if (data.room && data.cafeId && data.tableId && data.sessionId) {
            try {
                // Persist the call for robustness
                const staffCall = await prisma.staffCall.create({
                    data: {
                        cafeId: data.cafeId,
                        tableId: data.tableId,
                        sessionId: data.sessionId,
                        type: data.type || 'WAITER_CALL',
                        message: data.message,
                        status: 'PENDING'
                    },
                    include: { table: true }
                });

                // Broadcast to waiters
                socket.to(data.room).emit('call_waiter', { 
                    ...data, 
                    callId: staffCall.id,
                    timestamp: staffCall.createdAt 
                });
            } catch (error) {
                console.error('[Socket Call Waiter Error]', error);
            }
        } else if (data.room) {
            // Fallback for types that don't need persistence or have missing data
            socket.to(data.room).emit('call_waiter', data);
        }
    });

    socket.on('waiter_acknowledged', async (data: { callId: string; waiterId: string; waiterName: string }) => {
        try {
            const staffCall = await prisma.staffCall.update({
                where: { id: data.callId },
                data: { 
                    status: 'ACKNOWLEDGED',
                    staffId: data.waiterId
                },
                include: { session: true, table: true }
            });

            // Notify customer session
            io.to(staffCall.sessionId).emit('waiter_on_the_way', {
                message: `${data.waiterName} is coming to your table!`,
                waiterName: data.waiterName
            });

            // Broadcast update to all waiters to remove from active list or mark as taken
            io.to(`WAITER_${staffCall.cafeId}`).emit('call_status_update', {
                callId: staffCall.id,
                status: 'ACKNOWLEDGED',
                waiterName: data.waiterName
            });
        } catch (error) {
            console.error('[Socket Waiter Acknowledged Error]', error);
        }
    });

    socket.on('chef_call_waiter', async (data: { cafeId: string; tableId: string; sessionId: string; tableNumber: number }) => {
        try {
            const staffCall = await prisma.staffCall.create({
                data: {
                    cafeId: data.cafeId,
                    tableId: data.tableId,
                    sessionId: data.sessionId,
                    type: 'PICKUP_CALL',
                    message: `Food is ready for Table ${data.tableNumber}!`,
                    status: 'PENDING'
                }
            });

            // Broadcast to waiters of this cafe
            io.to(`WAITER_${data.cafeId}`).emit('call_waiter', {
                type: 'PICKUP_CALL',
                message: `Food ready for Table ${data.tableNumber}`,
                tableNumber: data.tableNumber,
                callId: staffCall.id,
                timestamp: staffCall.createdAt
            });
        } catch (error) {
            console.error('[Socket Chef Call Waiter Error]', error);
        }
    });

    socket.on('new_order', (order: any) => {
        // Broadcast to CHEF room of this cafe
        const chefRoom = `CHEF_${order.cafeId}`;
        socket.to(chefRoom).emit('new_order', order);
    });

    // WebRTC Signaling Events
    socket.on('offer', (data) => {
        socket.to(data.room).emit('offer', data.offer);
    });

    socket.on('answer', (data) => {
        socket.to(data.room).emit('answer', data.answer);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.room).emit('ice-candidate', data.candidate);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// ==========================================
// Start Server
// ==========================================

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
    console.log(`\n🔒 Security middleware active: Helmet, CORS, Rate Limiting`);
    console.log(`🌐 Allowed origins: ${allowedOrigins.join(', ')}`);
    console.log(`🚀 Server running on http://localhost:${PORT}\n`);
});
