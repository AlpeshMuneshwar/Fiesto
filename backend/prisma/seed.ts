/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const menuItems = [
    // Beverages
    { name: 'Classic Cappuccino', price: 4.50, desc: 'Rich espresso with silky steamed milk foam', category: 'Beverages', dietaryTag: 'VEG' },
    { name: 'Iced Caramel Macchiato', price: 5.50, desc: 'Chilled espresso with vanilla and caramel drizzle', category: 'Beverages', dietaryTag: 'VEG' },
    { name: 'Fresh Mint Mojito', price: 6.00, desc: 'Refreshing lime and mint cooler', category: 'Beverages', dietaryTag: 'VEGAN' },
    
    // Mains
    { name: 'Truffle Mushroom Pasta', price: 14.50, desc: 'Creamy fettuccine with wild mushrooms and truffle oil', category: 'Main Course', dietaryTag: 'VEG' },
    { name: 'Spicy Chicken Burger', price: 12.00, desc: 'Zesty grilled chicken with brioche bun and secret sauce', category: 'Main Course', dietaryTag: 'NON_VEG' },
    { name: 'Garden Fresh Pizza', price: 13.00, desc: 'Thin crust with bell peppers, olives, and mozzarella', category: 'Main Course', dietaryTag: 'VEG' },
    
    // Starters / Sides
    { name: 'Crispy Garlic Bread', price: 5.00, desc: 'Toasted baguette with herb butter and garlic', category: 'Starters', dietaryTag: 'VEG' },
    { name: 'Loaded Nachos', price: 8.50, desc: 'Corn chips with cheese sauce, jalapenos, and salsa', category: 'Starters', dietaryTag: 'VEG' },
    { name: 'Buffalo Wings', price: 9.00, desc: 'Spicy chicken wings served with ranch dip', category: 'Starters', dietaryTag: 'NON_VEG' },
    
    // Desserts
    { name: 'Death by Chocolate', price: 7.50, desc: 'Warm brownie with molten chocolate and ice cream', category: 'Desserts', dietaryTag: 'VEG' },
    { name: 'Classic Cheesecake', price: 6.50, desc: 'New York style cheesecake with berry compote', category: 'Desserts', dietaryTag: 'EGGETARIAN' },
];

async function main() {
    console.log('🚀 Starting Enhanced Seeding...');

    // Delete existing records in correct order
    console.log('🧹 Cleaning up old data...');
    await prisma.payment.deleteMany({});
    await prisma.staffCall.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.menuItem.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.table.deleteMany({});
    await prisma.cafeSettings.deleteMany({});
    await prisma.cafe.deleteMany({});

    // 1. Create Default Cafe
    console.log('Building cafe...');
    const cafe = await prisma.cafe.create({
        data: {
            name: 'The Premium Cafe',
            slug: 'main-cafe',
            address: '123 Tech Square, Innovation District',
            isActive: true,
            settings: {
                create: {
                    currencySymbol: '$',
                    taxEnabled: true,
                    taxRate: 5,
                    customerCanCallWaiter: true,
                    menuImagesEnabled: false,
                    reservationsEnabled: true, // enable reservations
                }
            }
        }
    });
    const cafeId = cafe.id;

    // 2. Seed Menu Items
    console.log('Cooking menu...');
    for (const item of menuItems) {
        await prisma.menuItem.create({
            data: { ...item, cafeId }
        });
    }

    // 3. Seed Users
    console.log('Hiring staff...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const users = [
        { name: 'Admin User', email: 'admin@cafe.com', role: 'ADMIN', cafeId },
        { name: 'Waiter John', email: 'waiter1@cafe.com', role: 'WAITER', cafeId },
        { name: 'Waiter Sarah', email: 'waiter2@cafe.com', role: 'WAITER', cafeId },
        { name: 'Chef Mario', email: 'chef1@cafe.com', role: 'CHEF', cafeId },
        { name: 'Chef Elena', email: 'chef2@cafe.com', role: 'CHEF', cafeId },
        { name: 'Super Admin', email: 'superadmin@cafeqr.com', role: 'SUPER_ADMIN', cafeId: null },
    ];

    for (const u of users) {
        await prisma.user.create({
            data: { ...u, password: hashedPassword }
        });
    }

    // 4. Seed Tables
    console.log('Setting up tables...');
    for (let i = 1; i <= 10; i++) {
        await prisma.table.create({
            data: {
                cafeId,
                number: i,
                capacity: i % 2 === 0 ? 4 : 2,
                qrCodeUrl: `http://localhost:8082/cafe/main-cafe/table/${i}` // Local testing URL
            }
        });
    }

    // 5. Seed Historical Data (Completed Orders)
    console.log('Generating sales history...');
    const tables = await prisma.table.findMany({ where: { cafeId } });
    
    for (let i = 0; i < 5; i++) {
        const session = await prisma.session.create({
            data: {
                cafeId,
                tableId: tables[i].id,
                isActive: false,
                deviceIdentifier: `hist_dev_${i}`,
                joinCode: '0000'
            }
        });

        await prisma.order.create({
            data: {
                sessionId: session.id,
                totalAmount: 25.00 + (i * 10),
                status: 'COMPLETED',
                cafeId,
                items: JSON.stringify([
                    { name: 'Burger', price: 12.00, quantity: 1 },
                    { name: 'Iced Latte', price: 5.50, quantity: 1 }
                ])
            }
        });
    }

    // 6. Seed Active Data (Live Dashboard Testing)
    console.log('Populating live sessions...');
    
    // Session 1: Table 1 - Preparing
    const s1 = await prisma.session.create({
        data: { cafeId, tableId: tables[0].id, isActive: true, deviceIdentifier: 'active_1', joinCode: '1111' }
    });
    await prisma.order.create({
        data: { 
            sessionId: s1.id, 
            totalAmount: 18.50, 
            status: 'PREPARING', 
            cafeId,
            items: JSON.stringify([{ name: 'Cappuccino', price: 4.50, quantity: 2 }])
        }
    });

    // Session 2: Table 2 - Ready
    const s2 = await prisma.session.create({
        data: { cafeId, tableId: tables[1].id, isActive: true, deviceIdentifier: 'active_2', joinCode: '2222' }
    });
    await prisma.order.create({
        data: { 
            sessionId: s2.id, 
            totalAmount: 12.00, 
            status: 'READY', 
            cafeId,
            items: JSON.stringify([{ name: 'Macchiato', price: 6.00, quantity: 2 }])
        }
    });

    // Session 3: Table 3 - Just Received
    const s3 = await prisma.session.create({
        data: { cafeId, tableId: tables[2].id, isActive: true, deviceIdentifier: 'active_3', joinCode: '3333' }
    });
    await prisma.order.create({
        data: { 
            sessionId: s3.id, 
            totalAmount: 42.00, 
            status: 'RECEIVED', 
            cafeId,
            items: JSON.stringify([
                { name: 'Pizza', price: 13.00, quantity: 2 },
                { name: 'Mojito', price: 8.00, quantity: 2 }
            ])
        }
    });

    // 7. Seed Staff Calls
    console.log('Sending staff alerts...');
    await prisma.staffCall.create({
        data: {
            cafeId,
            tableId: tables[0].id,
            sessionId: s1.id,
            type: 'WAITER_CALL',
            message: 'Need extra napkins',
            status: 'PENDING'
        }
    });

    console.log('✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!');
}

main()
    .catch(e => {
        console.error('❌ SEEDING FAILED:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
