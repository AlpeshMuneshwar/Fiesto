import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import jwt from 'jsonwebtoken';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate, menuItemSchema, menuItemUpdateSchema } from '../validators';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createWorker } from 'tesseract.js';
import { parseOCRText, parseCSVMenu } from '../utils/menu-parser';
import { asyncHandler } from '../middleware/error-handler';
import { io } from '../socket';

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

// Generic upload for CSVs and other non-image files
const anyUpload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Auto-Reset: Check for items that were Out of Stock in previous days
    const staleStockItems = await prisma.menuItem.findMany({
        where: {
            cafeId: targetCafeId,
            isAvailable: false,
            lastStockUpdate: { lt: startOfToday }
        }
    });

    if (staleStockItems.length > 0) {
        await prisma.menuItem.updateMany({
            where: { id: { in: staleStockItems.map(i => i.id) } },
            data: { isAvailable: true, lastStockUpdate: now }
        });
    }

    // Visibility: Filter by isActive for customers (unauthenticated or explicit flag)
    const includeInactive = req.query.includeInactive === 'true';
    const whereClause: any = { cafeId: targetCafeId };
    
    // Only admins/staff should see inactive items
    if (!includeInactive) {
        whereClause.isActive = true;
    }

    const items = await prisma.menuItem.findMany({
        where: whereClause,
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(items);
}));

// Download CSV Template
router.get('/csv-template', (req: Request, res: Response) => {
    const csvHeader = 'category,name,price,desc,dietaryTag,isAvailable,isActive,sortOrder\n';
    const csvExample1 = 'Beverages,Cappuccino,4.50,Freshly brewed espresso with steamed milk,VEG,true,true,0\n';
    const csvExample2 = 'Snacks,Chocolate Cookie,2.00,Classic choco chip cookie,VEG,true,true,1\n';
    const csvExample3 = 'Mains,Grilled Chicken Salad,12.50,Healthy green salad with grilled chicken,NON_VEG,false,true,2\n';
    
    res.header('Content-Type', 'text/csv');
    res.attachment('menu_template.csv');
    return res.send(csvHeader + csvExample1 + csvExample2 + csvExample3);
});

// Admin: Add Menu Item
router.post('/', authenticate, requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'CHEF']), handleUpload, asyncHandler(async (req: AuthRequest, res: Response) => {
    const cafeId = req.user!.cafeId;

    // Robust Body Parsing: Support both direct JSON and Multipart 'data' field
    let bodyData = req.body;
    if (req.body && req.body.data && typeof req.body.data === 'string') {
        try {
            bodyData = JSON.parse(req.body.data);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON in data field' });
        }
    }

    // DEBUG: Log received body context if validation fails
    const parsed = menuItemSchema.safeParse(bodyData);
    if (!parsed.success) {
        console.error('[Menu Validation Failed]', { body: req.body, bodyData });
        const errors = parsed.error.issues.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { name, desc, price, category, isAvailable, isActive, dietaryTag, sortOrder } = parsed.data;
    const imageUrl = req.file ? `/uploads/menu/${req.file.filename}` : null;

    const newItem = await prisma.menuItem.create({
        data: {
            cafeId,
            name,
            desc,
            price,
            category,
            isAvailable: isAvailable ?? true,
            isActive: isActive ?? true,
            lastStockUpdate: isAvailable === false ? new Date() : new Date(),
            dietaryTag: dietaryTag || null,
            sortOrder: sortOrder || 0,
            imageUrl,
        },
    });
    res.status(201).json(newItem);
}));

// Admin: Update Menu Item
router.put('/:id', authenticate, requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'CHEF']), handleUpload, asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const cafeId = req.user!.cafeId;

    // Robust Body Parsing
    let bodyData = req.body;
    if (req.body && req.body.data && typeof req.body.data === 'string') {
        try {
            bodyData = JSON.parse(req.body.data);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON in data field' });
        }
    }

    const parsed = menuItemUpdateSchema.safeParse(bodyData);
    if (!parsed.success) {
        console.error('[Menu Update Validation Failed]', { body: req.body, bodyData });
        const errors = parsed.error.issues.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Verify ownership
    const existingItem = await prisma.menuItem.findUnique({ where: { id } });
    if (!existingItem) return res.status(404).json({ error: 'Menu item not found' });
    if (existingItem.cafeId !== cafeId) return res.status(403).json({ error: 'Access denied' });

    const updateData: any = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.desc !== undefined) updateData.desc = parsed.data.desc;
    if (parsed.data.price !== undefined) updateData.price = parsed.data.price;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.isAvailable !== undefined) updateData.isAvailable = parsed.data.isAvailable;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.dietaryTag !== undefined) updateData.dietaryTag = parsed.data.dietaryTag;
    if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;

    // If stock status changed, update lastStockUpdate
    if (updateData.isAvailable !== undefined && updateData.isAvailable !== existingItem.isAvailable) {
        updateData.lastStockUpdate = new Date();
    }

    if (req.file) {
        updateData.imageUrl = `/uploads/menu/${req.file.filename}`;
    }

    const updatedItem = await prisma.menuItem.update({
        where: { id },
        data: updateData,
    });

    // Broadcast real-time menu updates to all connected customers 
    io.to(`CAFE_${cafeId}`).emit('menu_item_updated', updatedItem);

    res.json(updatedItem);
}));

// Admin: Delete Menu Item
router.delete('/:id', authenticate, requireRole(['ADMIN', 'MANAGER']), asyncHandler(async (req: AuthRequest, res: Response) => {
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

// Helper: Identify duplicates and resolve categories
async function processExtractedItems(cafeId: string, items: any[]) {
    const existingItems = await prisma.menuItem.findMany({
        where: { cafeId },
        select: { name: true, category: true }
    });
    
    const categoryMap = new Map();
    const existingNames = new Set();
    
    existingItems.forEach(i => {
        categoryMap.set(i.category.toLowerCase().trim(), i.category);
        existingNames.add(i.name.toLowerCase().trim());
    });
    
    return items.map(item => {
        const catLower = item.category?.toLowerCase().trim() || 'general';
        return {
            ...item,
            category: categoryMap.get(catLower) || item.category || 'General',
            isDuplicate: existingNames.has(item.name?.toLowerCase().trim())
        };
    });
}

// Admin: Bulk Upload via CSV
router.post('/bulk-csv', authenticate, requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), anyUpload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
    
    const cafeId = req.user!.cafeId;
    const buffer = fs.readFileSync(req.file.path);
    const rawItems = parseCSVMenu(buffer);
    
    const processedItems = await processExtractedItems(cafeId, rawItems);

    // Delete temp file
    fs.unlinkSync(req.file.path);

    res.json({ suggestedItems: processedItems });
}));

// Admin: Extract Menu from Image (OCR)
router.post('/extract-image', authenticate, requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), upload.single('image'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'Menu image is required' });

    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(req.file.path);
    await worker.terminate();

    const suggestedItems = parseOCRText(text);
    const processedItems = await processExtractedItems(req.user!.cafeId, suggestedItems);

    // Delete temp file
    fs.unlinkSync(req.file.path);

    res.json({ 
        rawText: text,
        suggestedItems: processedItems 
    });
}));

// Admin: Bulk Save Items (After review)
router.post('/bulk-save', authenticate, requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN', 'CHEF']), asyncHandler(async (req: AuthRequest, res: Response) => {
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
            isActive: true,
            lastStockUpdate: new Date()
        })),
    });

    res.status(201).json({ count: createdItems.count });
}));

export default router;
