import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, cafeSettingsSchema } from '../validators';

const router = Router();

// ==========================================
// GET /settings/ — Admin: get own cafe settings
// ==========================================
router.get('/', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;

        let settings = await prisma.cafeSettings.findUnique({ where: { cafeId } });

        // Auto-create defaults if none exist
        if (!settings) {
            settings = await prisma.cafeSettings.create({
                data: { cafeId },
            });
        }

        res.json(settings);
    } catch (error) {
        console.error('[Settings Get Error]', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ==========================================
// GET /settings/public/:cafeId — Public: get settings for customer menu behavior
// ==========================================
router.get('/public/:cafeId', async (req: any, res: Response) => {
    try {
        const { cafeId } = req.params;

        if (!cafeId || typeof cafeId !== 'string' || cafeId.length > 100) {
            res.status(400).json({ error: 'Invalid cafe ID' });
            return;
        }

        let settings = await prisma.cafeSettings.findUnique({ where: { cafeId } });

        if (!settings) {
            // Return defaults if no settings created yet
            settings = await prisma.cafeSettings.create({
                data: { cafeId },
            });
        }

        // Only return customer-facing settings (strip internal IDs)
        res.json({
            paymentMode: settings.paymentMode,
            taxEnabled: settings.taxEnabled,
            taxRate: settings.taxRate,
            taxLabel: settings.taxLabel,
            taxInclusive: settings.taxInclusive,
            serviceChargeEnabled: settings.serviceChargeEnabled,
            serviceChargeRate: settings.serviceChargeRate,
            customerCanCallWaiter: settings.customerCanCallWaiter,
            specialInstructions: settings.specialInstructions,
            showPrepTime: settings.showPrepTime,
            avgPrepTimeMinutes: settings.avgPrepTimeMinutes,
            dietaryTagsEnabled: settings.dietaryTagsEnabled,
            menuImagesEnabled: settings.menuImagesEnabled,
            currency: settings.currency,
            currencySymbol: settings.currencySymbol,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// ==========================================
// PUT /settings/ — Admin: update cafe settings
// ==========================================
router.put('/', authenticate, requireRole(['ADMIN']), validate(cafeSettingsSchema), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;

        const settings = await prisma.cafeSettings.upsert({
            where: { cafeId },
            update: req.body,
            create: { cafeId, ...req.body },
        });

        res.json({ message: 'Settings updated successfully', settings });
    } catch (error) {
        console.error('[Settings Update Error]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
