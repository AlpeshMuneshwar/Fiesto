import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

// Fail-fast: crash immediately if JWT_SECRET is not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('\n❌ FATAL: JWT_SECRET environment variable is not set!');
    console.error('   Please set JWT_SECRET in your .env file with a strong random secret.');
    console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    process.exit(1);
}

export interface AuthRequest extends Request {
    user?: { id: string; role: string; cafeId: string; name: string };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Access denied. No token provided.' });
        return;
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token || token.length < 10) {
        res.status(401).json({ error: 'Access denied. Invalid token format.' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string; cafeId: string; name: string; type?: string };

        // Reject refresh tokens used as access tokens
        if (decoded.type === 'refresh') {
            res.status(401).json({ error: 'Invalid token type. Use an access token.' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, role: true, cafeId: true, name: true, isActive: true },
        });

        if (!user) {
            res.status(401).json({ error: 'User not found.' });
            return;
        }

        if (!user.isActive) {
            res.status(423).json({ error: 'This account has been locked by the admin. Please contact the cafe administrator to continue.' });
            return;
        }

        req.user = { 
            id: user.id,
            role: user.role,
            cafeId: user.cafeId || '',
            name: user.name,
        };
        next();
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Token expired. Please refresh your session.' });
        } else {
            res.status(401).json({ error: 'Invalid token.' });
        }
        return;
    }
};

export const requireRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
            return;
        }
        next();
    };
};

export { JWT_SECRET };
