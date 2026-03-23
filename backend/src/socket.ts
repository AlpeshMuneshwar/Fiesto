import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
    // Parse allowed CORS origins from environment
    const allowedOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
        : ['http://localhost:8081', 'http://localhost:8082'];

    io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        // Limit payload size for socket messages
        maxHttpBufferSize: 1e6, // 1MB
    });

    // Socket.IO authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        // Allow customer connections without auth (they use session codes instead)
        const role = socket.handshake.auth?.role || socket.handshake.query?.role;
        if (role === 'CUSTOMER') {
            // Customers don't have JWT tokens — they use session-based access
            (socket as any).userData = { role: 'CUSTOMER' };
            return next();
        }

        // Staff connections MUST have a valid JWT
        if (!token) {
            return next(new Error('Authentication required. Provide a valid token.'));
        }

        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
            return next(new Error('Server configuration error.'));
        }

        try {
            const decoded = jwt.verify(token as string, JWT_SECRET) as {
                id: string;
                role: string;
                cafeId: string;
            };
            (socket as any).userData = decoded;
            next();
        } catch (err) {
            return next(new Error('Invalid or expired token.'));
        }
    });

    return io;
};

export { io };
