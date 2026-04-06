import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { validate, loginSchema, registerSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema, otpRequestSchema, otpVerifySchema, emailVerifySchema } from '../validators';
import { asyncHandler } from '../middleware/error-handler';
import { sendOTPEmail } from '../utils/email';

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

    // Only strict email verification for Admins/Super Admins who have access to sensitive data. 
    // Staff (Waiters/Chefs) are assumed verified since the Admin manually created their accounts.
    if (!user.isEmailVerified && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        res.status(403).json({ 
            error: 'Email not verified. Please verify your email to login.',
            needsVerification: true,
            email: user.email 
        });
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
        { id: user.id, role: user.role, cafeId: user.cafeId, name: user.name, type: 'access' },
        JWT_SECRET!,
        { expiresIn: 86400 } as any // 24 hours in seconds
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
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '1d',
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            cafeId: user.cafeId,
            isEmailVerified: user.isEmailVerified
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
        { id: user.id, role: user.role, cafeId: user.cafeId, name: user.name, type: 'access' },
        JWT_SECRET!,
        { expiresIn: 86400 } as any // 24 hours in seconds
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
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '1d',
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
    asyncHandler(async (req: AuthRequest, res: Response) => {
        const { name, email, password, role, cafeId: requestedCafeId } = req.body;
        const creator = req.user!;

        // Security: Force the staff to belong to the Admin's cafe.
        // Only SUPER_ADMINs can assign staff to any arbitrary cafe.
        const targetCafeId = creator.role === 'SUPER_ADMIN' ? requestedCafeId : creator.cafeId;

        if (!targetCafeId) {
            res.status(400).json({ error: 'A valid Cafe assignment is required.' });
            return;
        }

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
                cafeId: targetCafeId,
                isEmailVerified: true, // Auto-verify accounts since an Admin explicitly created them
            },
        });

        res.status(201).json({
            message: 'User created successfully. They can now login directly.',
            user: { id: user.id, email: user.email, role: user.role, cafeId: user.cafeId, isEmailVerified: true },
        });
    })
);

// ==========================================
// POST /request-otp — Request OTP for Login or Forgot Password
// ==========================================

router.post('/request-otp', validate(otpRequestSchema), asyncHandler(async (req: Request, res: Response) => {
    const { email, purpose } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        // For security, don't confirm if user exists, but for verification purposes it's fine
        res.json({ message: 'If an account exists, an OTP has been sent to your email.' });
        return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.user.update({
        where: { id: user.id },
        data: { otp, otpExpires }
    });

    await sendOTPEmail(email, otp, purpose);

    res.json({ message: 'OTP sent to your email.' });
}));

// ==========================================
// POST /request-registration-otp — Request OTP for NEW User Registration
// ==========================================
router.post('/request-registration-otp', validate(otpRequestSchema), asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        res.status(400).json({ error: 'Account with this email already exists. Please login.' });
        return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Upsert verification token
    await prisma.verificationToken.upsert({
        where: { email },
        update: { otp, expiresAt },
        create: { email, otp, expiresAt }
    });

    await sendOTPEmail(email, otp, 'VERIFY_EMAIL');

    res.json({ message: 'Verification code sent to your email.' });
}));

// ==========================================
// POST /login-otp — Login using OTP
// ==========================================

router.post('/login-otp', validate(otpVerifySchema), asyncHandler(async (req: Request, res: Response) => {
    const { email, otp } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
        console.warn(`[AUTH] Login OTP failed: User not found (${email})`);
        res.status(401).json({ error: 'Invalid or expired OTP' });
        return;
    }

    if (user.otp !== otp) {
        console.warn(`[AUTH] Login OTP mismatch for ${email}. Expected: ${user.otp}, Received: ${otp}`);
        res.status(401).json({ error: 'Invalid or expired OTP' });
        return;
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
        console.warn(`[AUTH] Login OTP expired for ${email}`);
        res.status(401).json({ error: 'Invalid or expired OTP' });
        return;
    }

    // Success - Clear OTP
    await prisma.user.update({
        where: { id: user.id },
        data: { otp: null, otpExpires: null, isEmailVerified: true } // Login with OTP also verifies email
    });

    // Generate tokens
    const accessToken = jwt.sign(
        { id: user.id, role: user.role, cafeId: user.cafeId, name: user.name, type: 'access' },
        JWT_SECRET!,
        { expiresIn: 86400 } as any
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshExpiryMs = 7 * 24 * 60 * 60 * 1000;
    refreshTokens.set(refreshToken, {
        userId: user.id,
        expiresAt: Date.now() + refreshExpiryMs,
    });

    res.json({
        token: accessToken,
        refreshToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '1d',
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            cafeId: user.cafeId,
            isEmailVerified: true
        },
    });
}));

// ==========================================
// POST /verify-email — Verify email using OTP
// ==========================================

router.post('/verify-email', validate(emailVerifySchema), asyncHandler(async (req: Request, res: Response) => {
    const { email, otp } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
        res.status(400).json({ error: 'Invalid or expired OTP' });
        return;
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { 
            isEmailVerified: true,
            otp: null,
            otpExpires: null
        }
    });

    res.json({ message: 'Email verified successfully. You can now login.' });
}));

// ==========================================
// POST /forgot-password — Generate reset token
// ==========================================

router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
        console.warn(`[AUTH] Forgot Password requested for non-existent email: ${email}`);
        res.status(404).json({ error: 'Account with this email not found.' });
        return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.user.update({
        where: { id: user.id },
        data: { otp, otpExpires }
    });

    await sendOTPEmail(email, otp, 'FORGOT_PASSWORD');

    console.log(`[AUTH] Forgot Password OTP (${otp}) sent to ${email}`);
    res.json({ message: 'A 6-digit OTP has been sent to your email.' });
}));

// ==========================================
// POST /reset-password — Complete password reset
// ==========================================

router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(async (req: Request, res: Response) => {
    const { email, otp, newPassword } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
        console.warn(`[AUTH] Reset Password failed: User not found (${email})`);
        res.status(400).json({ error: 'Invalid or expired OTP' });
        return;
    }

    if (user.otp !== otp) {
        console.warn(`[AUTH] Reset Password OTP mismatch for ${email}. Expected: ${user.otp}, Received: ${otp}`);
        res.status(400).json({ error: 'Invalid or expired OTP' });
        return;
    }

    if (!user.otpExpires || user.otpExpires < new Date()) {
        console.warn(`[AUTH] Reset Password OTP expired for ${email}`);
        res.status(400).json({ error: 'Invalid or expired OTP' });
        return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
        where: { id: user.id },
        data: { 
            password: hashedPassword,
            otp: null,
            otpExpires: null,
            isEmailVerified: true // Resetting password via email OTP also verifies email
        }
    });

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
