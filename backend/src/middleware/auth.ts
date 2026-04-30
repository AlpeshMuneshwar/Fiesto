import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { prisma } from '../prisma';
import { evaluateRoleAccessForMode, normalizeOrderRoutingMode } from '../utils/operational-mode';

// Fail-fast: crash immediately if JWT_SECRET is not configured
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('\n❌ FATAL: JWT_SECRET environment variable is not set!');
    console.error('   Please set JWT_SECRET in your .env file with a strong random secret.');
    console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    process.exit(1);
}
const JWT_SECRET: string = jwtSecret;

export interface AuthRequest extends Request {
    user?: { id: string; role: string; cafeId: string; name: string };
}

interface AuthTokenPayload extends JwtPayload {
    id: string;
    role: string;
    cafeId?: string | null;
    name: string;
    type?: string;
}

function isAuthTokenPayload(value: string | JwtPayload): value is AuthTokenPayload {
    if (typeof value === 'string') {
        return false;
    }

    return typeof value.id === 'string' && typeof value.role === 'string' && typeof value.name === 'string';
}

export async function resolveAuthUserFromRequest(req: Request): Promise<AuthRequest['user'] | null> {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token || token.length < 10) {
        return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!isAuthTokenPayload(decoded)) {
        return null;
    }
    if (decoded.type === 'refresh') {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true, cafeId: true, name: true, isActive: true },
    });

    if (!user || !user.isActive) {
        return null;
    }

    return {
        id: user.id,
        role: user.role,
        cafeId: user.cafeId || '',
        name: user.name,
    };
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
        const user = await resolveAuthUserFromRequest(req);
        if (!user) {
            res.status(401).json({ error: 'User not found.' });
            return;
        }

        if (user.cafeId && (user.role === 'WAITER' || user.role === 'CHEF')) {
            const settings = await prisma.cafeSettings.findUnique({
                where: { cafeId: user.cafeId },
                select: {
                    orderRoutingMode: true,
                    directAdminChefAppEnabled: true,
                } as any,
            });

            const access = evaluateRoleAccessForMode(user.role, settings as any);
            if (access.blocked) {
                res.status(423).json({
                    error: access.message,
                    code: access.code,
                    appDisabledByMode: true,
                    orderRoutingMode: normalizeOrderRoutingMode((settings as any)?.orderRoutingMode),
                });
                return;
            }
        }

        req.user = user;
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
