import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// GET /api/discover/cafes
// Returns active cafes that have reservations enabled
router.get('/cafes', async (req: Request, res: Response) => {
    try {
        const cafes = await prisma.cafe.findMany({
            where: {
                isActive: true,
                settings: {
                    reservationsEnabled: true
                }
            },
            include: {
                settings: true
            }
        });

        // Calculate availability simply by seeing if there's at least one free table
        // This could be optimized later, but works well for discovery list
        const cafesWithAvailability = await Promise.all(cafes.map(async (cafe) => {
            const vacantTable = await prisma.table.findFirst({
                where: {
                    cafeId: cafe.id,
                    isActive: true,
                    sessions: {
                        none: { isActive: true } // No active session means vacant
                    }
                }
            });

            return {
                ...cafe,
                hasAvailableTables: !!vacantTable
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

        const cafe = await prisma.cafe.findUnique({
            where: { id: cafeId },
            include: { settings: true }
        }) as any;

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
        let suitableTables = allVacantTables.filter(t => t.capacity >= minRequiredCapacity);

        if (suitableTables.length > 0) {
            // Find the minimum capacity among suitable tables
            const smallestFitCapacity = suitableTables[0].capacity;
            
            // Allow booking tables up to capacity + 2 (e.g., party of 3 can book a 4-seater or 5-seater)
            // But they shouldn't book a 10-seater if smaller options exist.
            suitableTables = suitableTables.filter(t => t.capacity <= smallestFitCapacity + 2);
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

export default router;
