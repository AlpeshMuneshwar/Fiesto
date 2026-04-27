import { Request, Response, NextFunction } from 'express';

export class ApiError extends Error {
    status: number;
    code: string;
    details?: any;

    constructor(status: number, message: string, code = 'API_ERROR', details?: any) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

/**
 * Wraps an async route handler to catch errors and pass them to the global error handler.
 * This eliminates the need for repetitive try/catch blocks in every route.
 */
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Centralized Global Error Handler Middleware
 */
export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as any).requestId || 'unknown';

    // Handle CORS errors gracefully
    if (err.message && err.message.includes('not allowed by CORS')) {
        return res.status(403).json({ error: 'Origin not allowed.', code: 'CORS_FORBIDDEN', requestId });
    }

    // Log the error for internal tracking
    console.error(`[API Error] [${requestId}] ${req.method} ${req.path}:`, err.message || err);
    if (process.env.NODE_ENV !== 'production' && err.stack) {
        console.error(err.stack);
    }

    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    
    // Determine the error message to send to the client
    let message = err.message || 'Internal Server Error';
    
    // Obfuscate database errors in production
    if (process.env.NODE_ENV === 'production' && status === 500) {
        message = 'An unexpected server error occurred. Please try again later.';
    }

    // Handle specific error types if needed (e.g., Prisma, JWT, Zod)
    if (err.name === 'PrismaClientKnownRequestError') {
        const prismaErr = err as any;
        if (prismaErr.code === 'P2002') {
            return res.status(400).json({
                error: 'A record with this unique value already exists.',
                code: 'DUPLICATE_RECORD',
                requestId,
            });
        }
    }

    res.status(status).json({ 
        error: message,
        code,
        requestId,
        details: err.details || undefined,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
};
