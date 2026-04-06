import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import bcrypt from 'bcrypt';
import { validate, staffSchema, profileUpdateSchema, categoryToggleSchema, staffUpdateSchema } from '../validators';
import { sendOTPEmail } from '../utils/email';
import { recordActivity } from '../utils/audit';

const router = Router();

// Get Admin Stats (Dashboard Insights)
router.get('/stats', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
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
router.get('/orders/all', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const orders = await (prisma.order as any).findMany({
            where: { cafeId },
            include: {
                session: {
                    include: { table: true }
                },
                waiter: {
                    select: { name: true }
                },
                chef: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all orders' });
    }
});

// Admin: Get all staff (Waiters/Chefs)
router.get('/staff', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
    try {
        const cafeId = req.user!.cafeId;
        const staff = await prisma.user.findMany({
            where: { cafeId, role: { in: ['WAITER', 'CHEF'] } },
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
        const { name, address, logoUrl } = req.body;
        const cafeId = req.user!.cafeId;

        const cafe = await prisma.cafe.update({
            where: { id: cafeId },
            data: { 
                name, 
                address, 
                logoUrl,
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
            metadata: { name, address }
        });

        res.json(cafe);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update cafe profile' });
    }
});

// Admin: Toggle all items in a category
router.put('/menu/category/:category/toggle', authenticate, requireRole(['ADMIN']), validate(categoryToggleSchema), async (req: AuthRequest, res: Response) => {
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
router.get('/report', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
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
router.get('/orders/:id/audit', authenticate, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
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
