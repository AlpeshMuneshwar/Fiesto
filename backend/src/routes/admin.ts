import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import bcrypt from 'bcrypt';
import multer from 'multer';
import sharp from 'sharp';
import { validate, staffSchema, profileUpdateSchema, categoryToggleSchema, staffUpdateSchema, discoveryProfileSchema } from '../validators';
import { sendOTPEmail } from '../utils/email';
import { recordActivity } from '../utils/audit';
import { parseGoogleMapsLink } from '../utils/google-maps';
import { parseLegacyGalleryImages, resolveDiscoveryMedia } from '../utils/discovery-media';
import { normalizePhoneNumber } from '../utils/phone';

const router = Router();

const discoveryUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024,
        files: 7,
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
    },
});

const handleDiscoveryUpload = (req: Request, res: Response, next: any) => {
    discoveryUpload.fields([
        { name: 'coverImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 6 },
    ])(req, res, (err: any) => {
        if (err instanceof multer.MulterError) {
            res.status(400).json({ error: `Upload error: ${err.message}` });
            return;
        }

        if (err) {
            res.status(400).json({ error: err.message || 'Failed to upload images.' });
            return;
        }

        next();
    });
};

const discoveryProfileSelect = {
    id: true,
    name: true,
    city: true,
    contactPhone: true,
    googleMapsUrl: true,
    latitude: true,
    longitude: true,
    isFeatured: true,
    featuredPriority: true,
    coverImage: true,
    galleryImages: true,
    discoveryAssets: {
        select: {
            id: true,
            kind: true,
            sortOrder: true,
            createdAt: true,
        },
    },
} as const;

const parseDiscoveryRequestBody = (body: any) => {
    if (body && typeof body.data === 'string') {
        try {
            return JSON.parse(body.data);
        } catch {
            throw new Error('Invalid JSON in data field.');
        }
    }

    return body;
};

const compressDiscoveryImage = async (file: Express.Multer.File, kind: 'COVER' | 'GALLERY') => {
    const width = kind === 'COVER' ? 1600 : 1400;
    const height = kind === 'COVER' ? 900 : 1400;
    const quality = kind === 'COVER' ? 80 : 76;

    const transformed = await sharp(file.buffer)
        .rotate()
        .resize({
            width,
            height,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });

    return {
        mimeType: 'image/webp',
        byteSize: transformed.info.size,
        data: transformed.data,
        originalName: file.originalname || null,
    };
};

const serializeDiscoveryProfile = (cafe: any, req: Request) => {
    const discoveryMedia = resolveDiscoveryMedia(cafe, req);

    return {
        id: cafe.id,
        name: cafe.name,
        city: cafe.city,
        contactPhone: cafe.contactPhone || null,
        googleMapsUrl: cafe.googleMapsUrl || null,
        latitude: cafe.latitude,
        longitude: cafe.longitude,
        isFeatured: cafe.isFeatured,
        featuredPriority: cafe.featuredPriority,
        coverImage: discoveryMedia.coverImage,
        coverImageAssetId: discoveryMedia.coverImageAssetId,
        galleryImages: discoveryMedia.galleryImages,
        galleryImageAssets: discoveryMedia.galleryImageAssets,
        legacyGalleryImages: discoveryMedia.legacyGalleryImages,
    };
};

router.get('/cafe-status', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const cafe = await prisma.cafe.findUnique({
            where: { id: cafeId },
            select: { id: true, name: true, isActive: true }
        });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        res.json(cafe);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch cafe status' });
    }
});

router.patch('/cafe-status', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            res.status(400).json({ error: 'isActive must be a boolean' });
            return;
        }

        const cafe = await prisma.cafe.update({
            where: { id: cafeId },
            data: {
                isActive,
                updatedBy: req.user?.id
            }
        });

        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: 'ADMIN',
            actionType: 'SETTINGS_UPDATE',
            message: `Cafe marked as ${isActive ? 'open' : 'closed'} for discovery`,
            metadata: { isActive }
        });

        res.json({
            message: `Cafe ${isActive ? 'opened' : 'closed'} successfully`,
            cafe: {
                id: cafe.id,
                name: cafe.name,
                isActive: cafe.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update cafe status' });
    }
});

// Get Admin Stats (Dashboard Insights)
router.get('/stats', authenticate, requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalOrdersToday, totalSalesToday, activeSessions, totalUsers, cafe] = await Promise.all([
            prisma.order.count({
                where: { cafeId, createdAt: { gte: today } }
            }),
            prisma.order.aggregate({
                where: {
                    cafeId,
                    createdAt: { gte: today },
                    status: { notIn: ['REJECTED'] }
                },
                _sum: { totalAmount: true }
            }),
            prisma.session.count({
                where: { cafeId, isActive: true }
            }),
            prisma.user.count({
                where: { cafeId }
            }),
            prisma.cafe.findUnique({
                where: { id: cafeId },
                select: { name: true, address: true }
            })
        ]);

        // Get Top Selling Items
        const orders = await prisma.order.findMany({
            where: { cafeId, status: { notIn: ['REJECTED'] } },
            select: { items: true }
        });

        const itemCounts: Record<string, number> = {};
        orders.forEach(order => {
            try {
                const items = JSON.parse(order.items);
                items.forEach((item: any) => {
                    if (item.name && typeof item.quantity === 'number') {
                        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
                    }
                });
            } catch (e) {
                // Skip malformed item data
            }
        });

        const topSelling = Object.entries(itemCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.json({
            today: {
                totalOrders: totalOrdersToday,
                revenue: totalSalesToday._sum.totalAmount || 0
            },
            activeSessions,
            totalUsers,
            topSelling,
            cafeName: cafe?.name,
            cafeAddress: cafe?.address
        });
    } catch (error) {
        console.error('[Admin Stats Error]', error);
        res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
});

// Get All Orders (for monitoring)
router.get('/orders/all', authenticate, requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const orderType = typeof req.query.orderType === 'string' ? req.query.orderType.toUpperCase() : '';
        const requestedLimit = parseInt(String(req.query.limit || '200'), 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(500, requestedLimit))
            : 200;
        const whereClause: any = { cafeId };
        if (['DINE_IN', 'PRE_ORDER', 'TAKEAWAY'].includes(orderType)) {
            whereClause.orderType = orderType;
        }

        const orders = await (prisma.order as any).findMany({
            where: whereClause,
            include: {
                session: {
                    include: {
                        table: true,
                        customer: {
                            select: { id: true, name: true, email: true, phoneNumber: true },
                        },
                    },
                },
                waiter: {
                    select: { name: true }
                },
                chef: {
                    select: { name: true }
                },
                payment: {
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        provider: true,
                        paymentStage: true,
                        transactionId: true,
                        providerOrderId: true,
                        providerPaymentId: true,
                        capturedAt: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        const enrichedOrders = (orders as any[]).map((order) => {
            let parsedItems: any[] = [];
            try {
                const items = JSON.parse(order.items || '[]');
                if (Array.isArray(items)) parsedItems = items;
            } catch {
                parsedItems = [];
            }

            const orderTypeLabel = order.orderType === 'PRE_ORDER'
                ? 'PREORDER'
                : order.orderType === 'TAKEAWAY'
                    ? 'TAKEAWAY'
                    : 'QR_ORDER';

            return {
                ...order,
                parsedItems,
                orderTypeLabel,
            };
        });

        res.json(enrichedOrders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all orders' });
    }
});

// Admin: Get all staff (Waiters/Chefs/Managers)
router.get('/staff', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const staff = await prisma.user.findMany({
            where: { cafeId, role: { in: ['WAITER', 'CHEF', 'MANAGER'] } },
            select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
        });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch staff' });
    }
});

// Admin: Add new staff member
router.post('/staff', authenticate, requireRole(['ADMIN']), validate(staffSchema), async (req: AuthRequest, res: Response) => {
    try {
        const { name, email: rawEmail, password, role } = req.body;
        const email = rawEmail.toLowerCase().trim();
        const cafeId = req.user!.cafeId;

        // Check if email is already in use
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(400).json({ error: 'Email already in use' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        const user = await prisma.user.create({
            data: { 
                name, 
                email, 
                password: hashedPassword, 
                role, 
                cafeId,
                isEmailVerified: false,
                otp,
                otpExpires,
                createdBy: req.user?.id,
                updatedBy: req.user?.id
            } as any
        });

        // Audit Log for Staff Creation
        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: 'ADMIN',
            actionType: 'SETTINGS_UPDATE',
            message: `Added new staff: ${name} (${role})`,
            metadata: { newStaffId: user.id, email }
        });

        // Send OTP email
        await sendOTPEmail(email, otp, 'VERIFY_EMAIL');

        res.status(201).json({ 
            id: user.id, 
            name: user.name, 
            email: user.email, 
            role: user.role,
            isEmailVerified: false,
            message: 'Staff created. A verification OTP has been sent to their email.'
        });
    } catch (error) {
        console.error('[Staff Create Error]', error);
        res.status(500).json({ error: 'Failed to create staff' });
    }
});

// Admin: Update staff member
router.put('/staff/:id', authenticate, requireRole(['ADMIN']), validate(staffUpdateSchema), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { name, email: rawEmail, role, isActive, password } = req.body;
        const email = rawEmail?.toLowerCase()?.trim();
        const cafeId = req.user!.cafeId;

        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing || existing.cafeId !== cafeId) {
            res.status(404).json({ error: 'Staff member not found' });
            return;
        }

        // Check if new email is already taken by ANOTHER user
        if (email && email !== existing.email) {
            const collision = await prisma.user.findUnique({ where: { email } });
            if (collision) {
                res.status(400).json({ error: 'New email is already in use by another staff member.' });
                return;
            }
        }

        // Build sanitized update data
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (password) {
            updateData.password = await bcrypt.hash(password, 12);
        }

        const user = await prisma.user.update({
            where: { id },
            data: {
                ...updateData,
                updatedBy: req.user?.id
            } as any
        });

        // Audit Log for Staff Update
        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: 'ADMIN',
            actionType: 'SETTINGS_UPDATE',
            message: `Updated staff member: ${user.name}`,
            metadata: { targetStaffId: id, changes: Object.keys(updateData) }
        });

        res.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update staff' });
    }
});

// Admin: Delete staff member
router.delete('/staff/:id', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const cafeId = req.user!.cafeId;

        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing || existing.cafeId !== cafeId) {
            res.status(404).json({ error: 'Staff member not found' });
            return;
        }

        // Check if waiter has processed orders, then deactivate instead of delete to preserve foreign keys
        try {
            await prisma.user.delete({ where: { id } });
            res.json({ message: 'Staff member deleted' });
        } catch (dbError) {
            // Foreign key constraint likely failed, gracefully deactivate instead
            await prisma.user.update({ where: { id }, data: { isActive: false } });
            res.json({ message: 'Staff member deactivated instead of deleted because they are associated with past orders.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete staff' });
    }
});

// Admin: Update Cafe Profile
router.put('/cafe-profile', authenticate, requireRole(['ADMIN']), validate(profileUpdateSchema), async (req: AuthRequest, res: Response) => {
    try {
        const { name, address, contactPhone, logoUrl, coverImage, galleryImages } = req.body;
        const cafeId = req.user!.cafeId;

        const cafe = await prisma.cafe.update({
            where: { id: cafeId },
            data: { 
                name, 
                address, 
                contactPhone: contactPhone === undefined ? undefined : normalizePhoneNumber(contactPhone),
                logoUrl,
                coverImage,
                galleryImages,
                updatedBy: req.user?.id
            } as any
        });

        // Audit Log
        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: 'ADMIN',
            actionType: 'SETTINGS_UPDATE',
            message: `Updated Cafe Profile: ${name}`,
            metadata: { name, address, contactPhone: cafe.contactPhone || null }
        });

        res.json(cafe);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update cafe profile' });
    }
});

// Admin: get discovery location/featured profile
router.get('/discovery-profile', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const cafe = await prisma.cafe.findUnique({
            where: { id: cafeId },
            select: discoveryProfileSelect,
        });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        res.json(serializeDiscoveryProfile(cafe, req));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch discovery profile';
        if (/Unknown column|doesn't exist|does not exist|Table .* doesn't exist/i.test(message)) {
            res.status(503).json({ error: 'Discovery profile migration is not applied. Run the latest Prisma migration and restart the backend.' });
            return;
        }
        res.status(500).json({ error: 'Failed to fetch discovery profile' });
    }
});

// Admin: update discovery location/featured profile
router.put('/discovery-profile', authenticate, requireRole(['ADMIN']), handleDiscoveryUpload, async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const bodyData = parseDiscoveryRequestBody(req.body);
        const parsed = discoveryProfileSchema.safeParse(bodyData);
        if (!parsed.success) {
            const details = parsed.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            res.status(400).json({ error: 'Validation failed', details });
            return;
        }

        const {
            city,
            contactPhone,
            googleMapsUrl,
            latitude,
            longitude,
            isFeatured,
            featuredPriority,
            clearCoordinates,
            clearCoverImage,
            coverImage,
            galleryImages,
            legacyGalleryImages,
            removeGalleryAssetIds,
        } = parsed.data;

        const fileMap = (req.files || {}) as Record<string, Express.Multer.File[]>;
        const coverUpload = fileMap.coverImage?.[0] ? await compressDiscoveryImage(fileMap.coverImage[0], 'COVER') : null;
        const galleryUploads = await Promise.all(
            (fileMap.galleryImages || []).map((file) => compressDiscoveryImage(file, 'GALLERY'))
        );

        let locationUpdate: {
            googleMapsUrl?: string | null;
            latitude?: number | null;
            longitude?: number | null;
        } = {};

        if (clearCoordinates) {
            locationUpdate = {
                googleMapsUrl: null,
                latitude: null,
                longitude: null,
            };
        } else if (typeof googleMapsUrl === 'string' && googleMapsUrl.trim()) {
            const parsedMaps = await parseGoogleMapsLink(googleMapsUrl);
            locationUpdate = {
                googleMapsUrl: parsedMaps.normalizedUrl,
                latitude: parsedMaps.latitude,
                longitude: parsedMaps.longitude,
            };
        } else {
            if (googleMapsUrl === null) locationUpdate.googleMapsUrl = null;
            if (latitude !== undefined) locationUpdate.latitude = latitude;
            if (longitude !== undefined) locationUpdate.longitude = longitude;
        }

        const nextLegacyGalleryImages = Array.isArray(legacyGalleryImages)
            ? legacyGalleryImages
            : galleryImages !== undefined
                ? parseLegacyGalleryImages(galleryImages)
                : undefined;

        const cafe = await prisma.$transaction(async (tx) => {
            const existingCafe = await tx.cafe.findUnique({
                where: { id: cafeId },
                select: {
                    id: true,
                },
            });

            if (!existingCafe) {
                throw new Error('Cafe not found');
            }

            if (clearCoverImage || coverImage === null || coverUpload) {
                await tx.cafeDiscoveryAsset.deleteMany({
                    where: {
                        cafeId,
                        kind: 'COVER',
                    },
                });
            }

            if (Array.isArray(removeGalleryAssetIds) && removeGalleryAssetIds.length > 0) {
                await tx.cafeDiscoveryAsset.deleteMany({
                    where: {
                        cafeId,
                        kind: 'GALLERY',
                        id: { in: removeGalleryAssetIds },
                    },
                });
            }

            if (coverUpload) {
                await tx.cafeDiscoveryAsset.create({
                    data: {
                        cafeId,
                        kind: 'COVER',
                        sortOrder: 0,
                        mimeType: coverUpload.mimeType,
                        originalName: coverUpload.originalName,
                        byteSize: coverUpload.byteSize,
                        data: coverUpload.data,
                        createdBy: req.user?.id,
                        updatedBy: req.user?.id,
                    },
                });
            }

            if (galleryUploads.length > 0) {
                const maxSortOrder = await tx.cafeDiscoveryAsset.aggregate({
                    where: {
                        cafeId,
                        kind: 'GALLERY',
                    },
                    _max: { sortOrder: true },
                });

                let nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;
                for (const galleryUpload of galleryUploads) {
                    await tx.cafeDiscoveryAsset.create({
                        data: {
                            cafeId,
                            kind: 'GALLERY',
                            sortOrder: nextSortOrder,
                            mimeType: galleryUpload.mimeType,
                            originalName: galleryUpload.originalName,
                            byteSize: galleryUpload.byteSize,
                            data: galleryUpload.data,
                            createdBy: req.user?.id,
                            updatedBy: req.user?.id,
                        },
                    });
                    nextSortOrder += 1;
                }
            }

            return tx.cafe.update({
                where: { id: cafeId },
                data: {
                    city,
                    contactPhone: contactPhone === undefined ? undefined : normalizePhoneNumber(contactPhone),
                    ...locationUpdate,
                    isFeatured: typeof isFeatured === 'boolean' ? isFeatured : undefined,
                    featuredPriority: typeof featuredPriority === 'number' ? featuredPriority : undefined,
                    coverImage: coverUpload
                        ? null
                        : coverImage !== undefined
                            ? coverImage
                            : clearCoverImage
                                ? null
                                : undefined,
                    galleryImages: nextLegacyGalleryImages !== undefined
                        ? (nextLegacyGalleryImages.length > 0 ? nextLegacyGalleryImages.join(',') : null)
                        : galleryImages === null
                            ? null
                            : undefined,
                    updatedBy: req.user?.id,
                },
                select: discoveryProfileSelect,
            });
        });

        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: 'ADMIN',
            actionType: 'SETTINGS_UPDATE',
            message: 'Updated discovery profile',
            metadata: {
                city,
                contactPhone: cafe.contactPhone || null,
                latitude: cafe.latitude,
                longitude: cafe.longitude,
                isFeatured,
                featuredPriority,
                mapsUrlProvided: Boolean(googleMapsUrl),
                coverUploaded: Boolean(coverUpload),
                galleryUploadedCount: galleryUploads.length,
                removedGalleryCount: removeGalleryAssetIds?.length || 0,
            },
        });

        res.json({ message: 'Discovery profile updated', cafe: serializeDiscoveryProfile(cafe, req) });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update discovery profile';
        const status = message === 'Cafe not found'
            ? 404
            : /Unknown column|doesn't exist|does not exist|Table .* doesn't exist/i.test(message)
                ? 503
            : /Google Maps|Paste a valid|Only JPG|Could not extract|Invalid JSON|http or https/i.test(message)
                ? 400
                : 500;
        res.status(status).json({
            error: status === 503
                ? 'Discovery profile migration is not applied. Run the latest Prisma migration and restart the backend.'
                : message,
        });
    }
});

// Admin: Toggle all items in a category
router.put('/menu/category/:category/toggle', authenticate, requireRole(['ADMIN', 'MANAGER']), validate(categoryToggleSchema), async (req: AuthRequest, res: Response) => {
    try {
        const category = req.params.category as string;
        const cafeId = req.user!.cafeId;
        const { isAvailable } = req.body;

        if (!category || typeof category !== 'string' || category.length > 50) {
            res.status(400).json({ error: 'Invalid category' });
            return;
        }

        await (prisma.menuItem as any).updateMany({
            where: { cafeId, category },
            data: { 
                isAvailable,
                updatedBy: req.user?.id 
            }
        });

        // Audit Log
        recordActivity({
            cafeId,
            staffId: req.user?.id,
            role: 'ADMIN',
            actionType: 'MENU_UPDATE',
            message: `${isAvailable ? 'Enabled' : 'Disabled'} category: ${category}`,
            metadata: { category, isAvailable }
        });

        res.json({ message: `Successfully updated all items in ${category}` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle category items' });
    }
});

// Admin: Daily Sales Report with date range
router.get('/report', authenticate, requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const { from, to } = req.query;

        // Default: today
        const startDate = from ? new Date(from as string) : new Date(new Date().setHours(0, 0, 0, 0));
        const endDate = to ? new Date(to as string) : new Date(new Date().setHours(23, 59, 59, 999));

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
            return;
        }

        const orders = await prisma.order.findMany({
            where: {
                cafeId,
                createdAt: { gte: startDate, lte: endDate },
                status: { notIn: ['REJECTED'] }
            },
            include: {
                session: { include: { table: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Aggregate stats
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
        const totalTax = orders.reduce((sum, o) => sum + o.taxAmount, 0);
        const totalServiceCharge = orders.reduce((sum, o) => sum + o.serviceCharge, 0);
        const totalSubtotal = orders.reduce((sum, o) => sum + o.subtotal, 0);

        // Top selling items
        const itemCounts: Record<string, { count: number; revenue: number }> = {};
        orders.forEach(order => {
            try {
                const items = JSON.parse(order.items);
                items.forEach((item: any) => {
                    if (item.name && typeof item.quantity === 'number') {
                        if (!itemCounts[item.name]) itemCounts[item.name] = { count: 0, revenue: 0 };
                        itemCounts[item.name].count += item.quantity;
                        itemCounts[item.name].revenue += (item.price || 0) * item.quantity;
                    }
                });
            } catch (e) { }
        });

        const topSelling = Object.entries(itemCounts)
            .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Hourly breakdown for charting
        const hourlyMap: Record<number, { count: number; revenue: number }> = {};
        for (let h = 0; h < 24; h++) hourlyMap[h] = { count: 0, revenue: 0 };
        orders.forEach(o => {
            const hour = new Date(o.createdAt).getHours();
            hourlyMap[hour].count += 1;
            hourlyMap[hour].revenue += o.totalAmount;
        });
        const hourlyBreakdown = Object.entries(hourlyMap).map(([hour, data]) => ({
            hour: parseInt(hour),
            label: `${parseInt(hour).toString().padStart(2, '0')}:00`,
            ...data
        }));

        // Status breakdown
        const statusCounts: Record<string, number> = {};
        orders.forEach(o => {
            statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        });

        res.json({
            period: { from: startDate.toISOString(), to: endDate.toISOString() },
            summary: {
                totalOrders,
                totalRevenue,
                totalSubtotal,
                totalTax,
                totalServiceCharge,
                avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            },
            topSelling,
            hourlyBreakdown,
            statusBreakdown: statusCounts,
            orders: orders.map(o => ({
                id: o.id,
                status: o.status,
                totalAmount: o.totalAmount,
                tableNumber: o.session?.table?.number,
                createdAt: o.createdAt,
                items: (() => { try { return JSON.parse(o.items); } catch { return []; } })(),
            }))
        });
    } catch (error) {
        console.error('[Report Error]', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Admin: Get Detailed Audit Log for a Specific Order
router.get('/orders/:id/audit', authenticate, requireRole(['ADMIN', 'MANAGER']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const { id } = req.params;

        const order = await (prisma.order as any).findFirst({
            where: { id: id as string, cafeId },
            include: {
                session: { include: { table: true } },
                waiter: { select: { name: true } },
                chef: { select: { name: true } }
            }
        });

        if (!order) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        // Fetch all ActivityLog entries related to this order via metadata search
        const logs = await (prisma as any).activityLog.findMany({
            where: {
                cafeId,
                metadata: { contains: id as string }
            },
            orderBy: { createdAt: 'asc' },
            include: { staff: { select: { name: true } } }
        });

        res.json({
            order,
            timeline: (logs as any[]).map(log => ({
                id: log.id,
                action: log.actionType,
                message: log.message,
                staffName: log.staff?.name || log.role || 'System',
                timestamp: log.createdAt,
                metadata: log.metadata ? JSON.parse(log.metadata) : null
            }))
        });
    } catch (error) {
        console.error('[Order Audit Error]', error);
        res.status(500).json({ error: 'Failed to fetch order audit lifecycle' });
    }
});

export default router;
