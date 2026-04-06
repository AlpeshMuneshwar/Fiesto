import { z } from 'zod';

// ==========================================
// Reusable base schemas
// ==========================================

const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number');

const emailSchema = z
    .string()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .transform((v) => v.toLowerCase().trim());

const uuidSchema = z.string().uuid('Invalid ID format');

const slugSchema = z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens only');

// ==========================================
// Auth Schemas
// ==========================================

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: emailSchema,
    password: passwordSchema,
    role: z.enum(['WAITER', 'CHEF', 'ADMIN', 'SUPER_ADMIN']).optional().default('WAITER'),
    cafeId: z.string().optional(),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
    email: emailSchema,
});

export const otpRequestSchema = z.object({
    email: emailSchema,
    purpose: z.enum(['LOGIN', 'FORGOT_PASSWORD', 'VERIFY_EMAIL']),
});

export const otpVerifySchema = z.object({
    email: emailSchema,
    otp: z.string().length(6, 'OTP must be 6 digits'),
    purpose: z.enum(['LOGIN', 'FORGOT_PASSWORD', 'VERIFY_EMAIL']),
});

export const resetPasswordSchema = z.object({
    email: emailSchema,
    otp: z.string().length(6, 'OTP must be 6 digits'),
    newPassword: passwordSchema,
});

export const emailVerifySchema = z.object({
    email: emailSchema,
    otp: z.string().length(6, 'OTP must be 6 digits'),
});

// ==========================================
// Tenant / Cafe Registration
// ==========================================

export const cafeRegistrationSchema = z.object({
    cafeName: z.string().min(2, 'Cafe name must be at least 2 characters').max(100),
    cafeSlug: slugSchema,
    ownerName: z.string().min(1, 'Owner name is required').max(100),
    ownerEmail: emailSchema,
    ownerPassword: passwordSchema,
    otp: z.string().length(6, 'Verification code must be 6 digits'),
});

// ==========================================
// Menu Item Schemas
// ==========================================

export const menuItemSchema = z.object({
    name: z.string().min(1, 'Item name is required').max(150),
    desc: z.string().max(500).default(''),
    price: z.number().positive('Price must be positive').max(99999, 'Price too high'),
    category: z.string().min(1, 'Category is required').max(50).default('General'),
    isAvailable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    dietaryTag: z.enum(['VEG', 'NON_VEG', 'VEGAN', 'EGGETARIAN']).optional().nullable(),
    sortOrder: z.number().int().min(0).optional(),
});

export const menuItemUpdateSchema = menuItemSchema.partial();

// ==========================================
// Order Schemas
// ==========================================

const orderItemSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    price: z.number().nonnegative(),
    quantity: z.number().int().positive().max(100, 'Max 100 per item'),
});

export const orderPlaceSchema = z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    items: z.array(orderItemSchema).min(1, 'At least one item required').max(50, 'Max 50 items per order'),
    totalAmount: z.number().positive('Total must be positive'),
    isLocationVerified: z.boolean().default(false),
    specialInstructions: z.string().max(500, 'Instructions too long').optional().nullable(),
});

export const orderStatusSchema = z.object({
    status: z.enum(['PREPARING', 'READY'], {
        message: 'Status must be PREPARING or READY',
    }),
});

export const orderApprovalSchema = z.object({
    approve: z.boolean(),
});

// ==========================================
// Payment Schemas
// ==========================================

export const checkoutRequestSchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    amount: z.number().positive('Amount must be positive'),
});

export const paymentVerifySchema = z.object({
    status: z.enum(['DONE', 'FAILED'], {
        message: 'Status must be DONE or FAILED',
    }),
    transactionId: z.string().optional(),
});

export const billGenerateSchema = z.object({
    paymentMethod: z.string().max(50).optional().default('CASH'),
    notes: z.string().max(200).optional(),
});

// ==========================================
// Session Schemas
// ==========================================

export const sessionStartSchema = z.object({
    cafeId: z.string().min(1, 'Cafe ID is required'),
    tableNumber: z.number().int().positive('Table number must be positive'),
    qrToken: z.string().min(1, 'QR Token is required'),
    deviceIdentifier: z.string().optional(),
    joinCode: z.string().max(8).optional(),
});

export const sessionJoinSchema = z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    joinCode: z.string().min(1, 'Join code is required'),
    deviceIdentifier: z.string().optional(),
});

export const forgotCodeSchema = z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
    cafeId: z.string().min(1, 'Cafe ID is required'),
    tableNumber: z.union([z.string(), z.number()]),
});

// ==========================================
// Table / Admin Schemas
// ==========================================

export const tableSchema = z.object({
    number: z.number().int().positive('Table number must be positive').max(9999),
    desc: z.string().max(100).optional(),
    capacity: z.number().int().min(1).max(20).optional().default(4),
});

export const staffSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: emailSchema,
    password: passwordSchema,
    role: z.enum(['WAITER', 'CHEF'], {
        message: 'Role must be WAITER or CHEF',
    }),
});

export const staffUpdateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100).optional(),
    email: emailSchema.optional(),
    role: z.enum(['WAITER', 'CHEF']).optional(),
    isActive: z.boolean().optional(),
});

export const profileUpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    address: z.string().max(500).optional(),
    logoUrl: z.string().url().optional().nullable(),
});

export const categoryToggleSchema = z.object({
    isAvailable: z.boolean(),
});

// ==========================================
// Cafe Settings Schema
// ==========================================

export const cafeSettingsSchema = z.object({
    paymentMode: z.enum(['WAITER_AT_TABLE', 'PAY_AT_COUNTER', 'BOTH'], {
        message: 'Payment mode must be WAITER_AT_TABLE, PAY_AT_COUNTER, or BOTH',
    }).optional(),
    taxEnabled: z.boolean().optional(),
    taxRate: z.number().min(0).max(100).optional(),
    taxLabel: z.string().max(20).optional(),
    gstNumber: z.string().max(30).optional().nullable(),
    taxInclusive: z.boolean().optional(),
    serviceChargeEnabled: z.boolean().optional(),
    serviceChargeRate: z.number().min(0).max(100).optional(),
    customerCanCallWaiter: z.boolean().optional(),
    specialInstructions: z.boolean().optional(),
    locationVerification: z.boolean().optional(),
    autoAcceptOrders: z.boolean().optional(),
    showPrepTime: z.boolean().optional(),
    avgPrepTimeMinutes: z.number().int().min(1).max(120).optional(),
    dietaryTagsEnabled: z.boolean().optional(),
    menuImagesEnabled: z.boolean().optional(),
    currency: z.string().max(5).optional(),
    currencySymbol: z.string().max(5).optional(),
});

// ==========================================
// Reservation Schemas (Phase 4)
// ==========================================

export const reservationSchema = z.object({
    cafeId: z.string().uuid('Valid Cafe ID required'),
    tableId: z.string().uuid('Valid Table ID required'),
    partySize: z.number().int().positive('Party size must be at least 1'),
    scheduledAt: z.string().datetime().optional(),
    items: z.array(orderItemSchema).default([]),
    deviceIdentifier: z.string().optional()
});

// ==========================================
// Validation helper middleware
// ==========================================

import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * On failure, returns 400 with a structured error response.
 */
export function validate(schema: z.ZodSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.issues.map((e: any) => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            res.status(400).json({
                error: 'Validation failed',
                details: errors,
            });
            return;
        }
        req.body = result.data; // Replace with parsed/sanitized data
        next();
    };
}
