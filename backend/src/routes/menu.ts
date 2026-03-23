import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import jwt from 'jsonwebtoken';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, menuItemSchema } from '../validators';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createWorker } from 'tesseract.js';
import { parseOCRText, parseCSVMenu } from '../utils/menu-parser';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

// ==========================================
// Multer Configuration for Menu Images
// ==========================================
const storage = multer.diskStorage({
    destination: './uploads/menu', // Ensure this folder exists or is created
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'));
        }
    },
});

// Middleware to handle Multer errors
const handleUpload = (req: any, res: any, next: any) => {
    upload.single('image')(req, res, (err: any) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
};

// ==========================================
// GET /menu/:cafeId — Fetch Menu (Public)
// ==========================================for a specific cafe
router.get('/', asyncHandler(async (req: any, res: Response) => {
    let cafeId = typeof req.query.cafeId === 'string' ? req.query.cafeId : undefined;

    // If no cafeId in query, try to get it from JWT if provided
    if (!cafeId) {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (token && process.env.JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
                cafeId = decoded.cafeId;
            } catch (err) {
                // Ignore JWT error, just proceed with check below
            }
        }
    }

    if (!cafeId) {
        res.status(400).json({ error: 'cafeId is required' });
        return;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeId);
    
    let targetCafeId = cafeId;
    if (!isUuid) {
        const cafe = await prisma.cafe.findUnique({ where: { slug: cafeId } });
        if (!cafe) {
            res.status(444).json({ error: 'Cafe not found (invalid slug)' });
            return;
        }
        targetCafeId = cafe.id;
    }

    const items = await prisma.menuItem.findMany({
        where: { cafeId: targetCafeId },
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(items);
}));

// Admin: Add Menu Item
router.post('/', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN', 'CHEF']), handleUpload, asyncHandler(async (req: AuthRequest, res: Response) => {
    const cafeId = req.user!.cafeId;

    // Parse JSON body if sent as multipart
    let bodyData = req.body;
    if (req.body.data) {
        try {
            bodyData = JSON.parse(req.body.data);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON in data field' });
        }
    }

    // Validate using Zod (manually since validate middleware doesn't run after multer easily without parsing)
    const parsed = menuItemSchema.safeParse(bodyData);
    if (!parsed.success) {
        const errors = parsed.error.issues.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { name, desc, price, category, isAvailable, dietaryTag, sortOrder } = parsed.data;
    const imageUrl = req.file ? `/uploads/menu/${req.file.filename}` : null;

    const newItem = await prisma.menuItem.create({
        data: {
            cafeId,
            name,
            desc,
            price,
            category,
            isAvailable: isAvailable ?? true,
            dietaryTag: dietaryTag || null,
            sortOrder: sortOrder || 0,
            imageUrl,
        },
    });
    res.status(201).json(newItem);
}));

// Admin: Update Menu Item
router.put('/:id', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN', 'CHEF']), handleUpload, asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const cafeId = req.user!.cafeId;

    // Parse JSON body if sent as multipart
    let bodyData = req.body;
    if (req.body.data) {
        try {
            bodyData = JSON.parse(req.body.data);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON in data field' });
        }
    }

    const parsed = menuItemSchema.safeParse(bodyData);
    if (!parsed.success) {
        const errors = parsed.error.issues.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { name, desc, price, category, isAvailable, dietaryTag, sortOrder } = parsed.data;

    // Verify ownership
    const existingItem = await prisma.menuItem.findUnique({ where: { id } });
    if (!existingItem) return res.status(404).json({ error: 'Menu item not found' });
    if (existingItem.cafeId !== cafeId) return res.status(403).json({ error: 'Access denied' });

    const updateData: any = {
        name,
        desc,
        price,
        category,
        isAvailable,
        dietaryTag: dietaryTag || null,
        sortOrder,
    };

    if (req.file) {
        updateData.imageUrl = `/uploads/menu/${req.file.filename}`;
    }

    const updatedItem = await prisma.menuItem.update({
        where: { id },
        data: updateData,
    });
    res.json(updatedItem);
}));

// Admin: Delete Menu Item
router.delete('/:id', authenticate, requireRole(['ADMIN']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const cafeId = req.user!.cafeId;

    // Check item exists and belongs to this cafe
    const existing = await prisma.menuItem.findUnique({ where: { id } });
    if (!existing || existing.cafeId !== cafeId) {
        res.status(404).json({ error: 'Menu item not found' });
        return;
    }

    await prisma.menuItem.delete({ where: { id, cafeId } });
    res.json({ message: 'Item deleted' });
}));

router.get('/categories', asyncHandler(async (req: any, res: Response) => {
    let cafeId = typeof req.query.cafeId === 'string' ? req.query.cafeId : undefined;

    // If no cafeId in query, try to get it from JWT if provided
    if (!cafeId) {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (token && process.env.JWT_SECRET) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
                cafeId = decoded.cafeId;
            } catch (err) {
                // Ignore JWT error, just proceed with check below
            }
        }
    }

    if (!cafeId) {
        res.status(400).json({ error: 'cafeId is required' });
        return;
    }

    // Validate cafeId format (basic length check)
    if (typeof cafeId !== 'string' || cafeId.length > 100) {
        res.status(400).json({ error: 'Invalid cafeId format' });
        return;
    }

    const categories = await prisma.menuItem.findMany({
        where: { cafeId },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
    });

    res.json(categories.map(c => c.category));
}));

// Admin: Bulk Upload via CSV
router.post('/bulk-csv', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN']), upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
    
    const cafeId = req.user!.cafeId;
    const buffer = fs.readFileSync(req.file.path);
    const items = parseCSVMenu(buffer);

    // Delete temp file
    fs.unlinkSync(req.file.path);

    res.json({ suggestedItems: items });
}));

// Admin: Extract Menu from Image (OCR)
router.post('/extract-image', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN']), upload.single('image'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'Menu image is required' });

    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(req.file.path);
    await worker.terminate();

    const suggestedItems = parseOCRText(text);

    // Delete temp file
    fs.unlinkSync(req.file.path);

    res.json({ 
        rawText: text,
        suggestedItems 
    });
}));

// Admin: Bulk Save Items (After review)
router.post('/bulk-save', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN', 'CHEF']), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Items array is required' });

    const cafeId = req.user!.cafeId;

    const createdItems = await prisma.menuItem.createMany({
        data: items.map((i: any) => ({
            cafeId,
            name: i.name,
            price: parseFloat(i.price) || 0,
            category: i.category || 'Uncategorized',
            desc: i.desc || '',
            isAvailable: true,
        })),
    });

    res.status(201).json({ count: createdItems.count });
}));

export default router;
