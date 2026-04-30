import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Executing raw SQL to extend Order column sizes...');
  
  // Alter Order.items to LONGTEXT
  await prisma.$executeRawUnsafe(`ALTER TABLE \`Order\` MODIFY \`items\` LONGTEXT NOT NULL;`);
  console.log('Order.items updated to LONGTEXT');
  
  // Alter Order.specialInstructions to TEXT
  await prisma.$executeRawUnsafe(`ALTER TABLE \`Order\` MODIFY \`specialInstructions\` TEXT;`);
  console.log('Order.specialInstructions updated to TEXT');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
