const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.user.updateMany({
      data: { isEmailVerified: true },
    });
    console.log('All users email verified:', result);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
