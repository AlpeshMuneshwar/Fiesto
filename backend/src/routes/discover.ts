import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// GET /api/discover/cafes
// Returns active cafes that have reservations enabled with enhanced discovery features
router.get('/cafes', async (req: Request, res: Response) => {
    try {
        const { lat, lng, radius = 10 } = req.query; // Optional location-based filtering

        const cafes = (await prisma.cafe.findMany({
            where: {
                isActive: true,
                settings: {
                    reservationsEnabled: true
                }
            },
            include: {
                settings: true,
                menuItems: {
                    where: { isActive: true },
                    take: 20, // Sample for tags/price estimate
                    select: { category: true, price: true, imageUrl: true, dietaryTag: true }
                },
                tables: {
                    where: { isActive: true },
                    select: { capacity: true }
                }
            }
        })) as any[];

        // Calculate availability, tags, and price range
        const cafesWithAvailability = await Promise.all(cafes.map(async (cafe: any) => {
            // Count available tables
            const availableTables = await prisma.table.count({
                where: {
                    cafeId: cafe.id,
                    isActive: true,
                    sessions: {
                        none: { isActive: true } // No active session means vacant
                    }
                }
            });

            // Extract unique categories and dietary tags
            const categories = Array.from(new Set(cafe.menuItems.map((m: any) => m.category))).filter(Boolean);
            const dietaryTags = Array.from(new Set(cafe.menuItems.map((m: any) => m.dietaryTag))).filter(Boolean);

            // Estimate price level ($ to $$$)
            const avgPrice = cafe.menuItems.length > 0
                ? cafe.menuItems.reduce((s: number, m: any) => s + m.price, 0) / cafe.menuItems.length
                : 0;

            let priceLevel = '$$';
            if (avgPrice < 200) priceLevel = '$';
            else if (avgPrice > 800) priceLevel = '$$$';

            // Use the first menu item with an image as a featured image if no logo
            const featuredImage = cafe.menuItems.find((m: any) => m.imageUrl)?.imageUrl || null;

            // Calculate total capacity and available capacity
            const totalCapacity = cafe.tables.reduce((sum: number, table: any) => sum + table.capacity, 0);
            const availableCapacity = availableTables * 4; // Rough estimate

            return {
                id: cafe.id,
                name: cafe.name,
                address: cafe.address,
                logoUrl: cafe.logoUrl,
                featuredImage,
                categories: categories.slice(0, 4), // Top 4 categories
                dietaryTags: dietaryTags.slice(0, 3), // Top 3 dietary options
                priceLevel,
                availableTables,
                totalTables: cafe.tables.length,
                availableCapacity,
                totalCapacity,
                hasAvailableTables: availableTables > 0,
                supportsTakeaway: true, // All cafes support takeaway
                supportsPreOrder: true, // All cafes support pre-order
                settings: {
                    currencySymbol: cafe.settings?.currencySymbol || '₹',
                    avgPrepTimeMinutes: cafe.settings?.avgPrepTimeMinutes || 15,
                    platformFeeAmount: cafe.settings?.platformFeeAmount || 10.0,
                    preOrderAdvanceRate: cafe.settings?.preOrderAdvanceRate || 40.0
                }
            };
        }));

        res.json(cafesWithAvailability);
    } catch (error: any) {
        console.error('Discover Cafes Error:', error);
        res.status(500).json({ error: 'Failed to fetch cafes' });
    }
});

// GET /api/discover/cafes/:cafeId/tables?partySize=4
// Returns vacant tables that fit the party size optimally
router.get('/cafes/:cafeId/tables', async (req: Request, res: Response) => {
    try {
        const cafeId = req.params.cafeId as string;
        const partySize = parseInt(req.query.partySize as string) || 1;

        if (partySize < 1) {
            res.status(400).json({ error: 'Party size must be at least 1' });
            return;
        }

        const cafe = (await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true }
        })) as any;

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        if (!cafe.settings?.reservationsEnabled) {
            res.status(403).json({ error: 'This cafe does not accept reservations.' });
            return;
        }

        // Find tables that are NOT currently occupied
        const allVacantTables = await prisma.table.findMany({
            where: {
                cafeId: cafeId as string,
                isActive: true,
                sessions: {
                    none: { isActive: true } // Must not have an active session
                }
            },
            orderBy: { capacity: 'asc' } // Order by smallest capacity first
        });

        // Smart Filtering: Find the smallest table that can fit the party size, 
        // plus maybe one size up. Don't show an 8-seater to a party of 2 if a 2-seater is available.
        const minRequiredCapacity = partySize;
        let suitableTables = allVacantTables.filter((t: any) => t.capacity >= minRequiredCapacity);

        if (suitableTables.length > 0) {
            // Find the minimum capacity among suitable tables
            const smallestFitCapacity = suitableTables[0].capacity;
            
            // Allow booking tables up to capacity + 2 (e.g., party of 3 can book a 4-seater or 5-seater)
            // But they shouldn't book a 10-seater if smaller options exist.
            suitableTables = suitableTables.filter((t: any) => t.capacity <= smallestFitCapacity + 2);
        }

        res.json({
            cafeName: cafe.name,
            tablesAvailable: suitableTables
        });
    } catch (error: any) {
        console.error('Discover Tables Error:', error);
        res.status(500).json({ error: 'Failed to fetch available tables' });
    }
});

// POST /api/discover/cafes/:cafeId/pre-order
// Create a pre-order booking with advance payment
router.post('/cafes/:cafeId/pre-order', async (req: Request, res: Response) => {
    try {
        const cafeId = req.params.cafeId as string;
        const { tableId, partySize, scheduledAt, items, specialInstructions, customerEmail, customerName } = req.body;

        if (!tableId || !partySize || !scheduledAt || !items || !customerEmail || !customerName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const cafe = (await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true }
        })) as any;

        if (!cafe || !cafe.settings?.reservationsEnabled) {
            res.status(404).json({ error: 'Cafe not found or reservations not enabled' });
            return;
        }

        // Check if table is available at the scheduled time
        const conflictingSession = await prisma.session.findFirst({
            where: {
                tableId,
                isActive: true,
                OR: [
                    {
                        scheduledAt: {
                            gte: new Date(scheduledAt),
                            lt: new Date(new Date(scheduledAt).getTime() + 2 * 60 * 60 * 1000) // 2 hours window
                        }
                    }
                ]
            }
        });

        if (conflictingSession) {
            res.status(409).json({ error: 'Table not available at this time' });
            return;
        }

        // Calculate pricing
        const menuItems = await prisma.menuItem.findMany({
            where: { id: { in: items.map((i: any) => i.id) }, cafeId }
        });

        const menuItemsMap = new Map(menuItems.map(i => [i.id, i]));
        let subtotal = 0;

        const secureItems = items.map((item: any) => {
            const menuItem = menuItemsMap.get(item.id);
            if (!menuItem) throw new Error(`Menu item not found: ${item.id}`);

            subtotal += menuItem.price * item.quantity;
            return { ...item, price: menuItem.price };
        });

        // Calculate advance payment (40% + platform fee)
        const advanceRate = cafe.settings?.preOrderAdvanceRate || 40.0;
        const platformFee = cafe.settings?.platformFeeAmount || 10.0;
        const advanceAmount = (subtotal * advanceRate / 100) + platformFee;

        // Create customer if doesn't exist
        let customer = await prisma.user.findFirst({
            where: { email: customerEmail, role: 'CUSTOMER' }
        });

        if (!customer) {
            customer = await prisma.user.create({
                data: {
                    name: customerName,
                    email: customerEmail,
                    password: `GUEST_PWD_${Math.random().toString(36).substring(7)}`, // Mandatory in schema
                    role: 'CUSTOMER',
                    isEmailVerified: false
                }
            });
        }

        // Create pre-booked session
        const session = await prisma.session.create({
            data: {
                cafeId,
                tableId,
                customerId: customer.id,
                isActive: true,
                isPrebooked: true,
                scheduledAt: new Date(scheduledAt),
                joinCode: Math.random().toString(36).substring(2, 8).toUpperCase()
            }
        });

        // Create pre-order
        const order = await prisma.order.create({
            data: {
                cafeId,
                sessionId: session.id,
                orderType: 'PRE_ORDER',
                status: 'RECEIVED', // Auto-approved for pre-orders
                items: JSON.stringify(secureItems),
                specialInstructions: specialInstructions || null,
                subtotal,
                totalAmount: subtotal, // Will be updated when final order is placed
                isPreorder: true,
                advancePaid: advanceAmount,
                createdBy: customer.id
            }
        });

        res.json({
            message: 'Pre-order created successfully',
            session,
            order,
            advanceAmount,
            joinCode: session.joinCode,
            scheduledAt: session.scheduledAt
        });

    } catch (error: any) {
        console.error('Pre-order Error:', error);
        res.status(500).json({ error: 'Failed to create pre-order' });
    }
});

// POST /api/discover/cafes/:cafeId/takeaway
// Create a takeaway order
router.post('/cafes/:cafeId/takeaway', async (req: Request, res: Response) => {
    try {
        const cafeId = req.params.cafeId as string;
        const { items, specialInstructions, customerEmail, customerName, pickupTime } = req.body;

        if (!items || !customerEmail || !customerName) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const cafe = (await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true }
        })) as any;

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        // Calculate pricing
        const menuItems = await prisma.menuItem.findMany({
            where: { id: { in: items.map((i: any) => i.id) }, cafeId }
        });

        const menuItemsMap = new Map(menuItems.map(i => [i.id, i]));
        let subtotal = 0;

        const secureItems = items.map((item: any) => {
            const menuItem = menuItemsMap.get(item.id);
            if (!menuItem) throw new Error(`Menu item not found: ${item.id}`);

            subtotal += menuItem.price * item.quantity;
            return { ...item, price: menuItem.price };
        });

        // Calculate advance payment for takeaway (40% + platform fee)
        const advanceRate = cafe.settings?.preOrderAdvanceRate || 40.0;
        const platformFee = cafe.settings?.platformFeeAmount || 10.0;
        const advanceAmount = (subtotal * advanceRate / 100) + platformFee;

        // Create customer if doesn't exist
        let customer = await prisma.user.findFirst({
            where: { email: customerEmail, role: 'CUSTOMER' }
        });

        if (!customer) {
            customer = await prisma.user.create({
                data: {
                    name: customerName,
                    email: customerEmail,
                    password: `GUEST_PWD_${Math.random().toString(36).substring(7)}`, // Mandatory in schema
                    role: 'CUSTOMER',
                    isEmailVerified: false
                }
            });
        }

        // Create takeaway session (no table, just for tracking)
        const session = await prisma.session.create({
            data: {
                cafeId,
                customerId: customer.id,
                isActive: true,
                isPrebooked: false, // Takeaway is immediate
                scheduledAt: pickupTime ? new Date(pickupTime) : new Date()
            }
        });

        // Create takeaway order
        const order = await prisma.order.create({
            data: {
                cafeId,
                sessionId: session.id,
                orderType: 'TAKEAWAY',
                status: 'RECEIVED', // Auto-approved for takeaway
                items: JSON.stringify(secureItems),
                specialInstructions: specialInstructions || null,
                subtotal,
                totalAmount: subtotal,
                isPreorder: false,
                advancePaid: advanceAmount,
                createdBy: customer.id
            }
        });

        res.json({
            message: 'Takeaway order created successfully',
            session,
            order,
            advanceAmount,
            orderId: order.id
        });

    } catch (error: any) {
        console.error('Takeaway Order Error:', error);
        res.status(500).json({ error: 'Failed to create takeaway order' });
    }
});

export default router;
