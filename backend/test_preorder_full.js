const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

(async () => {
  const prisma = new PrismaClient();
  try {
    const cafe = await prisma.cafe.findFirst();
    if (!cafe) throw new Error('No cafe found');
    const table = await prisma.table.findFirst({ where: { cafeId: cafe.id, capacity: { gte: 2 }, isActive: true } });
    const item = await prisma.menuItem.findFirst({ where: { cafeId: cafe.id } });
    if (!table) throw new Error('No suitable table');
    if (!item) throw new Error('No menu item');

    const body = JSON.stringify({
      tableId: table.id,
      partySize: 2,
      scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      bookingDurationMinutes: 60,
      items: [{ id: item.id, quantity: 1 }],
      customerEmail: 'test@example.com',
      customerName: 'Test User',
    });

    const curl = `curl -s -X POST http://127.0.0.1:4000/api/discover/cafes/${cafe.id}/pre-order `+
      `-H "Content-Type: application/json" -d '${body}'`;
    const resp = execSync(curl, { encoding: 'utf8' });
    console.log('Pre‑order response:', resp);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
