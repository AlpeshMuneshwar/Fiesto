import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { validate, loginSchema, registerSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

// ==========================================
// Brute-force protection (in-memory tracker)
// ==========================================

interface LoginAttempt {
    count: number;
    lockUntil: number | null;
}
const loginAttempts = new Map<string, LoginAttempt>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(email: string): { locked: boolean; remainingMs?: number } {
    const attempt = loginAttempts.get(email);
    if (!attempt) return { locked: false };

    if (attempt.lockUntil && Date.now() < attempt.lockUntil) {
        return { locked: true, remainingMs: attempt.lockUntil - Date.now() };
    }

    // Lock expired, reset
    if (attempt.lockUntil && Date.now() >= attempt.lockUntil) {
        loginAttempts.delete(email);
        return { locked: false };
    }

    return { locked: false };
}

function recordFailedAttempt(email: string): void {
    const attempt = loginAttempts.get(email) || { count: 0, lockUntil: null };
    attempt.count += 1;

    if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
        attempt.lockUntil = Date.now() + LOCK_DURATION_MS;
        console.warn(`[SECURITY] Account locked: ${email} after ${attempt.count} failed attempts`);
    }

    loginAttempts.set(email, attempt);
}

function clearAttempts(email: string): void {
    loginAttempts.delete(email);
}

// ==========================================
// Refresh token storage (in-memory — use Redis in production)
// ==========================================

const refreshTokens = new Map<string, { userId: string; expiresAt: number }>();
const resetTokens = new Map<string, { userId: string; expiresAt: number }>();

// Cleanup expired tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of refreshTokens) {
        if (data.expiresAt < now) refreshTokens.delete(token);
    }
    for (const [token, data] of resetTokens) {
        if (data.expiresAt < now) resetTokens.delete(token);
    }
}, 60 * 60 * 1000); // Every hour

// ==========================================
// POST /login
// ==========================================

router.post('/login', validate(loginSchema), asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Check brute-force lockout
    const bruteCheck = checkBruteForce(email);
    if (bruteCheck.locked) {
        const minutes = Math.ceil((bruteCheck.remainingMs || 0) / 60000);
        res.status(429).json({
            error: `Account temporarily locked due to too many failed attempts. Try again in ${minutes} minutes.`,
        });
        return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        recordFailedAttempt(email);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        recordFailedAttempt(email);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }

    // Successful login — clear failed attempts
    clearAttempts(email);

    // Generate short-lived access token
    const accessToken = jwt.sign(
        { id: user.id, role: user.role, cafeId: user.cafeId, type: 'access' },
        JWT_SECRET!,
        { expiresIn: 900 } as any // 15 minutes in seconds
    );

    // Generate long-lived refresh token
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshExpiryMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    refreshTokens.set(refreshToken, {
        userId: user.id,
        expiresAt: Date.now() + refreshExpiryMs,
    });

    res.json({
        token: accessToken,
        refreshToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            cafeId: user.cafeId,
        },
    });
}));

// ==========================================
// POST /refresh — Get new access token using refresh token
// ==========================================

router.post('/refresh', validate(refreshTokenSchema), asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        if (tokenData) refreshTokens.delete(refreshToken);
        res.status(401).json({ error: 'Invalid or expired refresh token. Please login again.' });
        return;
    }

    const user = await prisma.user.findUnique({ where: { id: tokenData.userId } });
    if (!user) {
        refreshTokens.delete(refreshToken);
        res.status(401).json({ error: 'User not found.' });
        return;
    }

    // Rotate: delete old refresh token, issue new pair
    refreshTokens.delete(refreshToken);

    const newAccessToken = jwt.sign(
        { id: user.id, role: user.role, cafeId: user.cafeId, type: 'access' },
        JWT_SECRET!,
        { expiresIn: 900 } as any // 15 minutes in seconds
    );

    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const refreshExpiryMs = 7 * 24 * 60 * 60 * 1000;
    refreshTokens.set(newRefreshToken, {
        userId: user.id,
        expiresAt: Date.now() + refreshExpiryMs,
    });

    res.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    });
}));

// ==========================================
// POST /logout — Revoke refresh token
// ==========================================

router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        refreshTokens.delete(refreshToken);
    }
    res.json({ message: 'Logged out successfully' });
}));

// ==========================================
// POST /register — PROTECTED: Only admins can create user accounts
// ==========================================

router.post(
    '/register',
    authenticate,
    requireRole(['ADMIN', 'SUPER_ADMIN']),
    validate(registerSchema),
    asyncHandler(async (req: Request, res: Response) => {
        const { name, email, password, role, cafeId } = req.body;

        // Check if user exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(400).json({ error: 'Email already in use' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12); // Increased cost from 10 to 12

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role || 'WAITER',
                cafeId,
            },
        });

        res.status(201).json({
            message: 'User created successfully',
            user: { id: user.id, email: user.email, role: user.role, cafeId: user.cafeId },
        });
    })
);

// ==========================================
// POST /forgot-password — Generate reset token
// ==========================================

router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    // Don't leak whether user exists for security reasons
    if (!user) {
        res.json({ message: 'If an account exists, a password reset link has been sent.' });
        return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins
    resetTokens.set(resetToken, { userId: user.id, expiresAt });

    // In production, integrate nodemailer here
    console.log(`\n\n[MOCK EMAIL] Password Reset Link for ${email}: \nReset Token: ${resetToken}\n(Normally this would be an email link: http://localhost:8081/reset-password/${resetToken})\n\n`);

    res.json({ message: 'If an account exists, a password reset link has been sent. Check the backend server logs for the token.' });
}));

// ==========================================
// POST /reset-password — Complete password reset
// ==========================================

router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    
    const tokenData = resetTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
        if (tokenData) resetTokens.delete(token);
        res.status(400).json({ error: 'Invalid or expired reset token.' });
        return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
        where: { id: tokenData.userId },
        data: { password: hashedPassword }
    });

    // Invalidate token
    resetTokens.delete(token);

    res.json({ message: 'Password reset successfully. You can now login.' });
}));

// ==========================================
// POST /push-token — Register Expo push notification token
// ==========================================

router.post('/push-token', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { pushToken } = req.body;
    if (!pushToken || typeof pushToken !== 'string') {
        res.status(400).json({ error: 'Push token is required' });
        return;
    }

    await prisma.user.update({
        where: { id: req.user!.id },
        data: { pushToken }
    });

    res.json({ message: 'Push token registered' });
}));

export default router;
