import { Request, Response, NextFunction } from 'express';

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
    // Handle CORS errors gracefully
    if (err.message && err.message.includes('not allowed by CORS')) {
        return res.status(403).json({ error: 'Origin not allowed.' });
    }

    // Log the error for internal tracking
    console.error(`[API Error] ${req.method} ${req.path}:`, err.message || err);
    if (process.env.NODE_ENV !== 'production' && err.stack) {
        console.error(err.stack);
    }

    const status = err.status || 500;
    
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
            return res.status(400).json({ error: 'A record with this unique value already exists.' });
        }
    }

    res.status(status).json({ 
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack, details: err })
    });
};
