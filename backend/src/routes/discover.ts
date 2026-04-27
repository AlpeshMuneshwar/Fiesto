import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { io } from '../socket';
import { notifyStaffByRole } from '../push';
import { isWithinBusinessHours, getBusinessHourMessage } from '../utils/business-hours';
import { validate, nearbyCafeRequestSchema } from '../validators';
import {
    computeAssignedSlot,
    DEFAULT_SESSION_MINUTES,
    getSessionEnd,
    getSessionStart,
    normalizeSlotMinutes,
} from '../utils/reservation-queue';

const router = Router();
const TAKEAWAY_ACTIVE_STATUSES = ['PENDING_APPROVAL', 'RECEIVED', 'PREPARING', 'READY'];

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);
const DEFAULT_RADIUS_KM = 20;

interface DiscoverSessionSnapshot {
    id: string;
    isActive: boolean;
    isPrebooked: boolean;
    scheduledAt: Date | null;
    slotDurationMinutes?: number | null;
    createdAt: Date;
    updatedAt: Date;
    deviceIdentifier?: string | null;
}

interface DiscoverTableSnapshot {
    id: string;
    number: number;
    capacity: number;
    sessions: DiscoverSessionSnapshot[];
}

const parseDateInput = (value: unknown, fallback: Date) => {
    if (!value || typeof value !== 'string') {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return parsed;
};

const toNumber = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const haversineDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const sanitizeItems = (items: unknown) => {
    if (!Array.isArray(items)) return [] as Array<{ id: string; quantity: number }>;

    return items
        .filter((item): item is { id: string; quantity: number } => {
            return Boolean(item && typeof item === 'object' && typeof (item as any).id === 'string');
        })
        .map((item) => ({
            id: item.id,
            quantity: Math.max(1, Number((item as any).quantity || 1)),
        }));
};

const getTableQueueSnapshot = (table: DiscoverTableSnapshot, requestedAt: Date, slotMinutes: number) => {
    const activeSession = table.sessions.find((session) => session.isActive);
    const queuedReservations = table.sessions.filter((session) => !session.isActive && session.isPrebooked);

    const slot = computeAssignedSlot(table.sessions, requestedAt, slotMinutes);

    return {
        activeSession,
        queuedReservations,
        queuePosition: slot.queuePosition,
        waitMinutes: slot.waitMinutes,
        nextSuggestedTime: slot.assignedStart,
        nextSlotEndsAt: slot.assignedEnd,
    };
};

const mapQueueStatus = (session: { isActive: boolean; deviceIdentifier?: string | null }, startsAt: Date) => {
    if (session.deviceIdentifier) return 'CHECKED_IN';
    if (session.isActive) return 'TABLE_READY';
    if (startsAt.getTime() > Date.now()) return 'SCHEDULED';
    return 'QUEUED';
};

// GET /api/discover/cafes?lat=&lng=&city=&radius=
router.get('/cafes', async (req: Request, res: Response) => {
    try {
        const userLat = toNumber(req.query.lat);
        const userLng = toNumber(req.query.lng);
        const cityFilter = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';
        const radiusKm = Math.max(1, Math.min(100, toNumber(req.query.radius) || DEFAULT_RADIUS_KM));

        const cafes: any[] = await prisma.cafe.findMany({
            where: {
                isActive: true,
                settings: {
                    reservationsEnabled: true,
                },
            },
            include: {
                settings: true,
                menuItems: {
                    where: { isActive: true },
                    take: 20,
                    select: { category: true, price: true, imageUrl: true, dietaryTag: true },
                },
                tables: {
                    where: { isActive: true },
                    include: {
                        sessions: {
                            where: {
                                OR: [
                                    { isActive: true },
                                    { isPrebooked: true, isActive: false },
                                ],
                            },
                            select: {
                                id: true,
                                isActive: true,
                                isPrebooked: true,
                                scheduledAt: true,
                                slotDurationMinutes: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
            },
        });

        const cafesWithAvailability = await Promise.all(cafes.map(async (cafe) => {
            const availableTables = await prisma.table.count({
                where: {
                    cafeId: cafe.id,
                    isActive: true,
                    sessions: {
                        none: { isActive: true },
                    },
                },
            });

            const categories = Array.from(new Set(cafe.menuItems.map((m: any) => m.category))).filter(Boolean);
            const dietaryTags = Array.from(new Set(cafe.menuItems.map((m: any) => m.dietaryTag))).filter(Boolean);

            const avgPrice = cafe.menuItems.length > 0
                ? cafe.menuItems.reduce((s: number, m: any) => s + m.price, 0) / cafe.menuItems.length
                : 0;

            let priceLevel = '$$';
            if (avgPrice < 200) priceLevel = '$';
            else if (avgPrice > 800) priceLevel = '$$$';

            const featuredImage = cafe.menuItems.find((m: any) => m.imageUrl)?.imageUrl || null;

            const totalCapacity = cafe.tables.reduce((sum: number, table: any) => sum + table.capacity, 0);
            const availableCapacity = availableTables * 4;
            const queuedReservations = cafe.tables.reduce((sum: number, table: any) => {
                return sum + table.sessions.filter((session: any) => !session.isActive && session.isPrebooked).length;
            }, 0);

            return {
                id: cafe.id,
                name: cafe.name,
                address: cafe.address,
                logoUrl: cafe.logoUrl,
                coverImage: cafe.coverImage,
                galleryImages: cafe.galleryImages,
                city: cafe.city || null,
                latitude: cafe.latitude ?? null,
                longitude: cafe.longitude ?? null,
                isFeatured: Boolean(cafe.isFeatured),
                featuredPriority: cafe.featuredPriority || 0,
                featuredImage,
                isOpenNow: isWithinBusinessHours({
                    openTime: cafe.settings?.businessOpenTime,
                    closeTime: cafe.settings?.businessCloseTime,
                }),
                businessHours: {
                    openTime: cafe.settings?.businessOpenTime || null,
                    closeTime: cafe.settings?.businessCloseTime || null,
                },
                categories: categories.slice(0, 4),
                dietaryTags: dietaryTags.slice(0, 3),
                priceLevel,
                availableTables,
                totalTables: cafe.tables.length,
                availableCapacity,
                totalCapacity,
                queuedReservations,
                hasAvailableTables: availableTables > 0,
                supportsTakeaway: true,
                supportsPreOrder: true,
                settings: {
                    currencySymbol: cafe.settings?.currencySymbol || 'Rs.',
                    avgPrepTimeMinutes: cafe.settings?.avgPrepTimeMinutes || 15,
                    platformFeeAmount: cafe.settings?.platformFeeAmount || 10.0,
                    preOrderAdvanceRate: cafe.settings?.preOrderAdvanceRate || 40.0,
                },
            };
        }));

        const enriched = cafesWithAvailability
            .map((cafe) => {
                const hasDistance = userLat !== null && userLng !== null && cafe.latitude !== null && cafe.longitude !== null;
                const distanceKm = hasDistance
                    ? haversineDistanceKm(userLat as number, userLng as number, cafe.latitude, cafe.longitude)
                    : null;
                return { ...cafe, distanceKm };
            })
            .sort((a, b) => {
                if (a.distanceKm === null && b.distanceKm === null) return 0;
                if (a.distanceKm === null) return 1;
                if (b.distanceKm === null) return -1;
                return a.distanceKm - b.distanceKm;
            });

        const cityMatched = cityFilter
            ? enriched.filter((cafe) => (cafe.city || '').toLowerCase() === cityFilter)
            : enriched;

        const featuredCafes = cityMatched
            .filter((cafe) => cafe.isFeatured)
            .sort((a, b) => {
                const featuredRank = (a.featuredPriority || 0) - (b.featuredPriority || 0);
                if (featuredRank !== 0) return featuredRank;
                if (a.distanceKm === null && b.distanceKm === null) return 0;
                if (a.distanceKm === null) return 1;
                if (b.distanceKm === null) return -1;
                return a.distanceKm - b.distanceKm;
            })
            .slice(0, 12);

        const nearbyCafes = cityMatched
            .filter((cafe) => (cafe.distanceKm === null ? true : cafe.distanceKm <= radiusKm))
            .slice(0, 40);

        res.json({
            city: cityFilter || null,
            radiusKm,
            hasUserLocation: userLat !== null && userLng !== null,
            featuredCafes,
            nearbyCafes,
            allCafesCount: enriched.length,
        });
    } catch (error) {
        console.error('Discover Cafes Error:', error);
        res.status(500).json({ error: 'Failed to fetch cafes' });
    }
});

// POST /api/discover/request-cafe
router.post('/request-cafe', validate(nearbyCafeRequestSchema), async (req: Request, res: Response) => {
    try {
        const { city, locality, latitude, longitude, note, customerEmail, customerName } = req.body;

        const request = await prisma.nearbyCafeRequest.create({
            data: {
                city: city.trim(),
                locality: locality?.trim() || null,
                latitude: latitude ?? null,
                longitude: longitude ?? null,
                note: note?.trim() || null,
                customerEmail: customerEmail?.trim().toLowerCase() || null,
                customerName: customerName?.trim() || null,
                source: 'DISCOVERY_APP',
            },
        });

        res.status(201).json({
            message: 'Thanks. We will try to bring cafes to your area soon.',
            requestId: request.id,
        });
    } catch (error) {
        console.error('Request Cafe Error:', error);
        res.status(500).json({ error: 'Failed to submit your request' });
    }
});

// GET /api/discover/cafes/:cafeId/tables?partySize=4&scheduledAt=...&slotMinutes=60
router.get('/cafes/:cafeId/tables', async (req: Request, res: Response) => {
    try {
        const cafeId = String(req.params.cafeId || '');
        const partySize = Math.max(1, parseInt((req.query.partySize as string) || '1', 10));
        const requestedAt = parseDateInput(req.query.scheduledAt as string | undefined, new Date());
        const slotMinutes = normalizeSlotMinutes(parseInt((req.query.slotMinutes as string | undefined) || `${DEFAULT_SESSION_MINUTES}`, 10));

        const cafe: any = await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true },
        });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        if (!cafe.settings?.reservationsEnabled) {
            res.status(403).json({ error: 'This cafe does not accept reservations.' });
            return;
        }

        if (!isWithinBusinessHours({
            openTime: cafe.settings?.businessOpenTime,
            closeTime: cafe.settings?.businessCloseTime,
        })) {
            res.status(403).json({
                error: 'This cafe is closed right now.',
                details: [getBusinessHourMessage({
                    openTime: cafe.settings?.businessOpenTime,
                    closeTime: cafe.settings?.businessCloseTime,
                })],
            });
            return;
        }

        const candidateTables: any[] = await prisma.table.findMany({
            where: {
                cafeId,
                isActive: true,
            },
            include: {
                sessions: {
                    where: {
                        OR: [
                            { isActive: true },
                            { isPrebooked: true, isActive: false },
                        ],
                    },
                    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
                    select: {
                        id: true,
                        isActive: true,
                        isPrebooked: true,
                        scheduledAt: true,
                        slotDurationMinutes: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
            orderBy: { capacity: 'asc' },
        });

        let suitableTables = candidateTables.filter((table) => table.capacity >= partySize);

        if (suitableTables.length > 0) {
            const smallestFit = suitableTables[0].capacity;
            suitableTables = suitableTables.filter((table) => table.capacity <= smallestFit + 2);
        }

        const enrichedTables = suitableTables.map((table) => {
            const snapshot = getTableQueueSnapshot(table as DiscoverTableSnapshot, requestedAt, slotMinutes);

            return {
                id: table.id,
                number: table.number,
                capacity: table.capacity,
                isAvailableNow: snapshot.waitMinutes === 0,
                queueLength: snapshot.queuedReservations.length,
                queuePosition: snapshot.queuePosition,
                waitMinutes: snapshot.waitMinutes,
                nextSuggestedTime: snapshot.nextSuggestedTime,
                nextSlotEndsAt: snapshot.nextSlotEndsAt,
                canQueue: Boolean(snapshot.activeSession) || snapshot.queuedReservations.length > 0,
            };
        });

        res.json({
            cafeName: cafe.name,
            requestedAt,
            slotMinutes,
            tablesAvailable: enrichedTables.filter((table) => table.isAvailableNow),
            tablesQueueable: enrichedTables.filter((table) => !table.isAvailableNow || table.queueLength > 0),
        });
    } catch (error) {
        console.error('Discover Tables Error:', error);
        res.status(500).json({ error: 'Failed to fetch available tables' });
    }
});

// GET /api/discover/cafes/:cafeId/daily-tables?partySize=4&date=YYYY-MM-DD
router.get('/cafes/:cafeId/daily-tables', async (req: Request, res: Response) => {
    try {
        const cafeId = String(req.params.cafeId || '');
        const partySize = Math.max(1, parseInt((req.query.partySize as string) || '1', 10));
        const dateInput = req.query.date as string;
        
        if (!dateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
            return;
        }

        const [year, month, day] = dateInput.split('-').map((n) => parseInt(n, 10));
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
        const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

        const cafe: any = await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true },
        });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        if (!cafe.settings?.reservationsEnabled) {
            res.status(403).json({ error: 'This cafe does not accept reservations.' });
            return;
        }

        const candidateTables = await prisma.table.findMany({
            where: { cafeId, isActive: true },
            include: {
                sessions: {
                    where: {
                        OR: [
                            { isActive: true },
                            { isPrebooked: true, isActive: false },
                        ],
                        // Sessions that could possibly overlap with this day
                        scheduledAt: { gte: new Date(dayStart.getTime() - 24 * 60 * 60 * 1000), lte: dayEnd },
                    },
                    select: {
                        id: true,
                        scheduledAt: true,
                        slotDurationMinutes: true,
                    },
                },
            },
            orderBy: { capacity: 'asc' },
        });

        let suitableTables = candidateTables.filter((table) => table.capacity >= partySize);

        if (suitableTables.length > 0) {
            const smallestFit = suitableTables[0].capacity;
            suitableTables = suitableTables.filter((table) => table.capacity <= smallestFit + 2);
        }

        const tablesWithSchedule = suitableTables.map((table) => {
            const bookedSlots = table.sessions
                .filter(s => s.scheduledAt)
                .map(s => {
                    const start = new Date(s.scheduledAt!);
                    const duration = s.slotDurationMinutes || DEFAULT_SESSION_MINUTES;
                    const end = new Date(start.getTime() + duration * 60 * 1000);
                    return { start: start.toISOString(), end: end.toISOString() };
                });

            return {
                id: table.id,
                number: table.number,
                capacity: table.capacity,
                bookedSlots,
            };
        });

        res.json({
            cafeName: cafe.name,
            businessOpenTime: cafe.settings?.businessOpenTime || '08:00',
            businessCloseTime: cafe.settings?.businessCloseTime || '22:00',
            tables: tablesWithSchedule,
        });

    } catch (error) {
        console.error('Discover Daily Tables Error:', error);
        res.status(500).json({ error: 'Failed to fetch daily table schedule' });
    }
});

// POST /api/discover/cafes/:cafeId/pre-order
router.post('/cafes/:cafeId/pre-order', async (req: Request, res: Response) => {
    try {
        const cafeId = String(req.params.cafeId || '');
        const {
            tableId,
            partySize,
            scheduledAt,
            bookingDurationMinutes,
            items,
            specialInstructions,
            customerEmail,
            customerName,
        } = req.body as {
            tableId?: string;
            partySize?: number;
            scheduledAt?: string;
            bookingDurationMinutes?: number;
            items?: unknown;
            specialInstructions?: string;
            customerEmail?: string;
            customerName?: string;
        };

        if (!tableId || !partySize || !customerEmail || !customerName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const secureItemsInput = sanitizeItems(items);
        if (secureItemsInput.length === 0) {
            res.status(400).json({ error: 'Select at least one item for pre-order.' });
            return;
        }

        const cafe: any = await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true },
        });

        if (!cafe || !cafe.settings?.reservationsEnabled) {
            res.status(404).json({ error: 'Cafe not found or reservations not enabled' });
            return;
        }

        if (!isWithinBusinessHours({
            openTime: cafe.settings?.businessOpenTime,
            closeTime: cafe.settings?.businessCloseTime,
        })) {
            res.status(403).json({
                error: 'Preorders are only available during cafe business hours.',
                details: [getBusinessHourMessage({
                    openTime: cafe.settings?.businessOpenTime,
                    closeTime: cafe.settings?.businessCloseTime,
                })],
            });
            return;
        }

        const requestedStart = parseDateInput(scheduledAt, addMinutes(new Date(), 60));
        const slotMinutes = normalizeSlotMinutes(bookingDurationMinutes);

        const table: any = await prisma.table.findFirst({
            where: {
                id: tableId,
                cafeId,
                isActive: true,
                capacity: { gte: Math.max(1, Number(partySize)) },
            },
            include: {
                sessions: {
                    where: {
                        OR: [
                            { isActive: true },
                            { isPrebooked: true, isActive: false },
                        ],
                    },
                    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
                    select: {
                        id: true,
                        isActive: true,
                        isPrebooked: true,
                        scheduledAt: true,
                        slotDurationMinutes: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
        });

        if (!table) {
            res.status(404).json({ error: 'Table not found or does not fit this party size.' });
            return;
        }

        const slot = computeAssignedSlot(table.sessions as DiscoverSessionSnapshot[], requestedStart, slotMinutes);
        const shouldQueue = slot.queuePosition > 0;
        const shouldActivateNow = !shouldQueue && slot.assignedStart.getTime() <= Date.now();

        const menuItems: any[] = await prisma.menuItem.findMany({
            where: { id: { in: secureItemsInput.map((i) => i.id) }, cafeId },
        });

        const menuItemsMap = new Map(menuItems.map((item) => [item.id, item]));
        let subtotal = 0;

        const secureItems = secureItemsInput.map((item) => {
            const menuItem = menuItemsMap.get(item.id);
            if (!menuItem) {
                throw new Error(`Menu item not found: ${item.id}`);
            }

            subtotal += menuItem.price * item.quantity;
            return {
                id: menuItem.id,
                name: menuItem.name,
                quantity: item.quantity,
                price: menuItem.price,
            };
        });

        const advanceRate = cafe.settings?.preOrderAdvanceRate || 40.0;
        const platformFee = cafe.settings?.platformFeeAmount || 10.0;
        const advancePaid = (subtotal * advanceRate) / 100;
        const totalPaidNow = advancePaid + platformFee;

        let customer = await prisma.user.findFirst({
            where: { email: customerEmail.trim().toLowerCase(), role: 'CUSTOMER' },
        });

        if (!customer) {
            customer = await prisma.user.create({
                data: {
                    name: customerName.trim(),
                    email: customerEmail.trim().toLowerCase(),
                    password: `GUEST_PWD_${Math.random().toString(36).substring(7)}`,
                    role: 'CUSTOMER',
                    isEmailVerified: false,
                },
            });
        }

        const session = await prisma.session.create({
            data: {
                cafeId,
                tableId,
                customerId: customer.id,
                isActive: shouldActivateNow,
                isPrebooked: true,
                scheduledAt: slot.assignedStart,
                slotDurationMinutes: slotMinutes,
                joinCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                createdBy: customer.id,
                updatedBy: customer.id,
            },
        });

        const order = await prisma.order.create({
            data: {
                cafeId,
                sessionId: session.id,
                orderType: 'PRE_ORDER',
                status: 'RECEIVED',
                items: JSON.stringify(secureItems),
                specialInstructions: specialInstructions?.trim() || null,
                subtotal,
                totalAmount: subtotal,
                isPreorder: true,
                platformFee,
                advancePaid,
                createdBy: customer.id,
                updatedBy: customer.id,
            },
        });

        await prisma.payment.create({
            data: {
                orderId: order.id,
                amount: totalPaidNow,
                provider: 'RAZORPAY',
                status: 'PENDING',
                paymentStage: 'PENDING',
                createdBy: customer.id,
                updatedBy: customer.id,
            } as any,
        });

        const fullOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { session: { include: { table: true } } },
        });
        io.to(`CHEF_${cafeId}`).emit('new_order', fullOrder);
        notifyStaffByRole(
            cafeId,
            'CHEF',
            'New Pre-order',
            `${customerName.trim()} placed a PRE_ORDER for ${slot.assignedStart.toLocaleTimeString()}.`
        );

        res.json({
            message: shouldQueue ? 'Pre-order queued successfully' : 'Pre-order created successfully',
            session,
            order,
            reservationStatus: shouldQueue ? 'QUEUED' : 'CONFIRMED',
            queuePosition: slot.queuePosition,
            advanceAmount: totalPaidNow,
            joinCode: session.joinCode,
            requestedStartAt: requestedStart,
            assignedStartAt: slot.assignedStart,
            assignedEndAt: slot.assignedEnd,
            waitMinutes: slot.waitMinutes,
            bookingDurationMinutes: slotMinutes,
        });
    } catch (error: any) {
        console.error('Pre-order Error:', error);
        res.status(500).json({ error: error?.message || 'Failed to create pre-order' });
    }
});

// POST /api/discover/cafes/:cafeId/takeaway
router.post('/cafes/:cafeId/takeaway', async (req: Request, res: Response) => {
    try {
        const cafeId = String(req.params.cafeId || '');
        const {
            items,
            specialInstructions,
            customerEmail,
            customerName,
            pickupTime,
        } = req.body as {
            items?: unknown;
            specialInstructions?: string;
            customerEmail?: string;
            customerName?: string;
            pickupTime?: string;
        };

        if (!customerEmail || !customerName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const secureItemsInput = sanitizeItems(items);
        if (secureItemsInput.length === 0) {
            res.status(400).json({ error: 'Select at least one item for takeaway.' });
            return;
        }

        const cafe: any = await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true },
        });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        if (!isWithinBusinessHours({
            openTime: cafe.settings?.businessOpenTime,
            closeTime: cafe.settings?.businessCloseTime,
        })) {
            res.status(403).json({
                error: 'Takeaway orders are only available during cafe business hours.',
                details: [getBusinessHourMessage({
                    openTime: cafe.settings?.businessOpenTime,
                    closeTime: cafe.settings?.businessCloseTime,
                })],
            });
            return;
        }

        const menuItems: any[] = await prisma.menuItem.findMany({
            where: { id: { in: secureItemsInput.map((i) => i.id) }, cafeId },
        });

        const menuItemsMap = new Map(menuItems.map((item) => [item.id, item]));
        let subtotal = 0;

        const secureItems = secureItemsInput.map((item) => {
            const menuItem = menuItemsMap.get(item.id);
            if (!menuItem) {
                throw new Error(`Menu item not found: ${item.id}`);
            }

            subtotal += menuItem.price * item.quantity;
            return {
                id: menuItem.id,
                name: menuItem.name,
                quantity: item.quantity,
                price: menuItem.price,
            };
        });

        const advanceRate = cafe.settings?.preOrderAdvanceRate || 40.0;
        const platformFee = cafe.settings?.platformFeeAmount || 10.0;
        const advancePaid = (subtotal * advanceRate) / 100;
        const totalPaidNow = advancePaid + platformFee;
        const prepMinutes = Math.max(5, cafe.settings?.avgPrepTimeMinutes || 15);

        const queueAhead = await prisma.order.count({
            where: {
                cafeId,
                orderType: { in: ['TAKEAWAY', 'PRE_ORDER'] },
                status: { in: TAKEAWAY_ACTIVE_STATUSES },
            },
        });

        const pickupAt = parseDateInput(pickupTime, addMinutes(new Date(), prepMinutes * (queueAhead + 1)));

        let customer = await prisma.user.findFirst({
            where: { email: customerEmail.trim().toLowerCase(), role: 'CUSTOMER' },
        });

        if (!customer) {
            customer = await prisma.user.create({
                data: {
                    name: customerName.trim(),
                    email: customerEmail.trim().toLowerCase(),
                    password: `GUEST_PWD_${Math.random().toString(36).substring(7)}`,
                    role: 'CUSTOMER',
                    isEmailVerified: false,
                },
            });
        }

        const session = await prisma.session.create({
            data: {
                cafeId,
                customerId: customer.id,
                isActive: true,
                isPrebooked: false,
                scheduledAt: pickupAt,
                createdBy: customer.id,
                updatedBy: customer.id,
            },
        });

        const order = await prisma.order.create({
            data: {
                cafeId,
                sessionId: session.id,
                orderType: 'TAKEAWAY',
                status: 'RECEIVED',
                items: JSON.stringify(secureItems),
                specialInstructions: specialInstructions?.trim() || null,
                subtotal,
                totalAmount: subtotal,
                isPreorder: false,
                platformFee,
                advancePaid,
                createdBy: customer.id,
                updatedBy: customer.id,
            },
        });

        await prisma.payment.create({
            data: {
                orderId: order.id,
                amount: totalPaidNow,
                provider: 'RAZORPAY',
                status: 'PENDING',
                paymentStage: 'PENDING',
                createdBy: customer.id,
                updatedBy: customer.id,
            } as any,
        });

        const fullOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { session: { include: { table: true } } },
        });
        io.to(`CHEF_${cafeId}`).emit('new_order', fullOrder);
        notifyStaffByRole(
            cafeId,
            'CHEF',
            'New Takeaway',
            `${customerName.trim()} placed a TAKEAWAY order.`
        );

        res.json({
            message: 'Takeaway order created successfully',
            session,
            order,
            advanceAmount: totalPaidNow,
            orderId: order.id,
            queuePosition: queueAhead + 1,
            estimatedReadyAt: addMinutes(new Date(), prepMinutes * (queueAhead + 1)),
        });
    } catch (error: any) {
        console.error('Takeaway Order Error:', error);
        res.status(500).json({ error: error?.message || 'Failed to create takeaway order' });
    }
});

// GET /api/discover/cafes/:cafeId/tracker/:sessionId?joinCode=ABC123
router.get('/cafes/:cafeId/tracker/:sessionId', async (req: Request, res: Response) => {
    try {
        const cafeId = String(req.params.cafeId || '');
        const sessionId = String(req.params.sessionId || '');
        const joinCode = typeof req.query.joinCode === 'string' ? req.query.joinCode.trim() : '';

        const session: any = await prisma.session.findFirst({
            where: { id: sessionId, cafeId },
            include: {
                table: {
                    select: { id: true, number: true, capacity: true },
                },
                cafe: {
                    select: { id: true, name: true, settings: true },
                },
                orders: {
                    orderBy: { createdAt: 'desc' },
                    take: 3,
                    select: {
                        id: true,
                        status: true,
                        orderType: true,
                        createdAt: true,
                        totalAmount: true,
                    },
                },
            },
        });

        if (!session) {
            res.status(404).json({ error: 'Tracker not found' });
            return;
        }

        if (session.joinCode && session.joinCode !== joinCode) {
            res.status(403).json({ error: 'Invalid tracker code' });
            return;
        }

        if (session.tableId && session.table) {
            const tableSessions = await prisma.session.findMany({
                where: {
                    tableId: session.tableId,
                    OR: [
                        { isActive: true },
                        { isPrebooked: true },
                    ],
                },
                orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    isActive: true,
                    isPrebooked: true,
                    scheduledAt: true,
                    slotDurationMinutes: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            const sorted = tableSessions
                .map((entry) => ({
                    ...entry,
                    start: getSessionStart(entry as DiscoverSessionSnapshot),
                    end: getSessionEnd(entry as DiscoverSessionSnapshot, DEFAULT_SESSION_MINUTES),
                }))
                .sort((a, b) => {
                    if (a.start.getTime() === b.start.getTime()) {
                        return a.createdAt.getTime() - b.createdAt.getTime();
                    }
                    return a.start.getTime() - b.start.getTime();
                });

            const currentIndex = sorted.findIndex((entry) => entry.id === session.id);
            const startsAt = getSessionStart(session as unknown as DiscoverSessionSnapshot);
            const endsAt = getSessionEnd(session as unknown as DiscoverSessionSnapshot, DEFAULT_SESSION_MINUTES);
            const queueAhead = currentIndex > 0 ? sorted.slice(0, currentIndex).length : 0;
            const queueStatus = mapQueueStatus(session, startsAt);

            res.json({
                sessionId: session.id,
                type: 'PREORDER',
                cafe: session.cafe,
                table: session.table,
                joinCode: session.joinCode,
                queueStatus,
                queuePosition: queueStatus === 'QUEUED' || queueStatus === 'SCHEDULED' ? queueAhead + 1 : 0,
                queueAhead,
                startsAt,
                endsAt,
                bookingDurationMinutes: session.slotDurationMinutes || DEFAULT_SESSION_MINUTES,
                minutesUntilStart: Math.max(0, Math.ceil((startsAt.getTime() - Date.now()) / 60000)),
                isCheckedIn: Boolean(session.deviceIdentifier),
                latestOrder: session.orders[0] || null,
                updatedAt: session.updatedAt,
            });
            return;
        }

        const latestOrder = session.orders[0] || null;
        let queuePosition = 0;

        if (latestOrder) {
            queuePosition = await prisma.order.count({
                where: {
                    cafeId,
                    orderType: { in: ['TAKEAWAY', 'PRE_ORDER'] },
                    status: { in: TAKEAWAY_ACTIVE_STATUSES },
                    createdAt: { lte: latestOrder.createdAt },
                },
            });
        }

        res.json({
            sessionId: session.id,
            type: 'TAKEAWAY',
            cafe: session.cafe,
            queueStatus: latestOrder?.status || 'PENDING',
            queuePosition,
            startsAt: session.scheduledAt,
            minutesUntilReady: session.scheduledAt
                ? Math.max(0, Math.ceil((new Date(session.scheduledAt).getTime() - Date.now()) / 60000))
                : null,
            latestOrder,
            updatedAt: session.updatedAt,
        });
    } catch (error) {
        console.error('Discover Tracker Error:', error);
        res.status(500).json({ error: 'Failed to fetch tracker status' });
    }
});

export default router;
