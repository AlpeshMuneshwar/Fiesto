const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
(async () => {
  const prisma = new PrismaClient();
  const cafe = await prisma.cafe.findFirst();
  const table = await prisma.table.findFirst({ where: { cafeId: cafe.id, capacity: { gte: 2 }, isActive: true } });
  const item = await prisma.menuItem.findFirst({ where: { cafeId: cafe.id } });
  const body = {
    tableId: table.id,
    partySize: 2,
    scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    bookingDurationMinutes: 60,
    items: [{ id: item.id, quantity: 1 }],
    customerEmail: 'test@example.com',
    customerName: 'Test User',
  };
  fs.writeFileSync('preorder_body.json', JSON.stringify(body, null, 2));
  console.log('preorder_body.json created');
  await prisma.$disconnect();
})();
