const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

(async () => {
  const prisma = new PrismaClient();
  try {
    const cafe = await prisma.cafe.findFirst();
    if (!cafe) { console.error('No cafe found'); process.exit(1); }
    const cafeId = cafe.id;

    // Find a suitable table (capacity >=2)
    const table = await prisma.table.findFirst({ where: { cafeId, capacity: { gte: 2 }, isActive: true } });
    if (!table) { console.error('No table found'); process.exit(1); }
    const tableId = table.id;

    // Find a menu item
    const menuItem = await prisma.menuItem.findFirst({ where: { cafeId } });
    if (!menuItem) { console.error('No menu item found'); process.exit(1); }
    const menuItemId = menuItem.id;

    // Build scheduledAt (now + 30 minutes)
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const body = JSON.stringify({
      tableId,
      partySize: 2,
      scheduledAt,
      bookingDurationMinutes: 60,
      items: [{ id: menuItemId, quantity: 1 }],
      customerEmail: 'test@example.com',
      customerName: 'Test User',
    });

    const curlCmd = `curl -s -X POST http://127.0.0.1:4000/api/discover/cafes/${cafeId}/pre-order ` +
      `-H "Content-Type: application/json" -d '${body}'`;
    const response = execSync(curlCmd, { encoding: 'utf8' });
    console.log('Pre‑order response:', response);
  } catch (e) {
    console.error('Error during test:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
