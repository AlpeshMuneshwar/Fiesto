const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MANAGER', 'CHEF', 'WAITER'] } },
      select: { id: true, email: true, role: true }
    });
    console.log(JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
