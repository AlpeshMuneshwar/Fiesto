import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth';
import { validate, cafeRegistrationSchema } from '../validators';

const router = Router();

// Register a new Cafe (SaaS Onboarding)
router.post('/register', validate(cafeRegistrationSchema), async (req: Request, res: Response) => {
    try {
        const { cafeName, cafeSlug, ownerName, ownerEmail, ownerPassword } = req.body;

        // 1. Validate if slug is taken
        const existingCafe = await prisma.cafe.findUnique({ where: { slug: cafeSlug } });
        if (existingCafe) {
            res.status(400).json({ error: 'Cafe slug already taken' });
            return;
        }

        // 2. Validate if email is taken
        const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
        if (existingUser) {
            res.status(400).json({ error: 'Email already in use' });
            return;
        }

        // 3. Create Cafe, Owner User, and Default Settings in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const newCafe = await tx.cafe.create({
                data: {
                    name: cafeName,
                    slug: cafeSlug,
                    settings: {
                        create: {} // Create default settings
                    }
                },
            });

            const hashedPassword = await bcrypt.hash(ownerPassword, 12);
            const user = await tx.user.create({
                data: {
                    name: ownerName,
                    email: ownerEmail,
                    password: hashedPassword,
                    role: 'ADMIN', // Owners get ADMIN role
                    cafeId: newCafe.id
                }
            });

            return { cafe: newCafe, user };
        });

        res.status(201).json({
            message: 'Cafe registered successfully!',
            cafe: result.cafe,
            owner: { id: result.user.id, email: result.user.email }
        });
    } catch (error) {
        console.error('[Tenant Register Error]', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Fetch Cafe Details by Slug (Public for Landing/Customer Menu)
router.get('/:slug', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;

        if (!slug || typeof slug !== 'string' || slug.length > 50) {
            res.status(400).json({ error: 'Invalid slug' });
            return;
        }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
        
        const cafe = await prisma.cafe.findFirst({
            where: isUuid ? { id: slug } : { slug },
            select: { id: true, name: true, logoUrl: true, address: true, isActive: true }
        });

        if (!cafe) {
            res.status(404).json({ error: 'Cafe not found' });
            return;
        }

        res.json(cafe);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch cafe' });
    }
});

export default router;
