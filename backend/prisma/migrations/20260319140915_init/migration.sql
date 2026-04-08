/*
  Warnings:

  - A unique constraint covering the columns `[cafeId,number]` on the table `Table` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cafeId` to the `MenuItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cafeId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cafeId` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cafeId` to the `Table` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Table_number_key` ON `Table`;

-- AlterTable
ALTER TABLE `MenuItem` ADD COLUMN `cafeId` VARCHAR(191) NOT NULL,
    ADD COLUMN `dietaryTag` VARCHAR(191) NULL,
    ADD COLUMN `imageUrl` VARCHAR(191) NULL,
    ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0,
    MODIFY `desc` VARCHAR(191) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `advancePaid` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `cafeId` VARCHAR(191) NOT NULL,
    ADD COLUMN `isPreorder` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `platformFee` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `serviceCharge` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `specialInstructions` VARCHAR(191) NULL,
    ADD COLUMN `subtotal` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `taxAmount` DOUBLE NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Session` ADD COLUMN `cafeId` VARCHAR(191) NOT NULL,
    ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `isPrebooked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `joinCode` VARCHAR(191) NULL,
    ADD COLUMN `scheduledAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Table` ADD COLUMN `cafeId` VARCHAR(191) NOT NULL,
    ADD COLUMN `capacity` INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `cafeId` VARCHAR(191) NULL,
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `Cafe` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Cafe_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CafeSettings` (
    `id` VARCHAR(191) NOT NULL,
    `cafeId` VARCHAR(191) NOT NULL,
    `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'WAITER_AT_TABLE',
    `taxEnabled` BOOLEAN NOT NULL DEFAULT false,
    `taxRate` DOUBLE NOT NULL DEFAULT 0,
    `taxLabel` VARCHAR(191) NOT NULL DEFAULT 'GST',
    `taxInclusive` BOOLEAN NOT NULL DEFAULT false,
    `serviceChargeEnabled` BOOLEAN NOT NULL DEFAULT false,
    `serviceChargeRate` DOUBLE NOT NULL DEFAULT 0,
    `customerCanCallWaiter` BOOLEAN NOT NULL DEFAULT true,
    `specialInstructions` BOOLEAN NOT NULL DEFAULT true,
    `locationVerification` BOOLEAN NOT NULL DEFAULT false,
    `autoAcceptOrders` BOOLEAN NOT NULL DEFAULT false,
    `showPrepTime` BOOLEAN NOT NULL DEFAULT false,
    `avgPrepTimeMinutes` INTEGER NOT NULL DEFAULT 15,
    `dietaryTagsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `menuImagesEnabled` BOOLEAN NOT NULL DEFAULT true,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
    `currencySymbol` VARCHAR(191) NOT NULL DEFAULT '₹',
    `platformFeeAmount` DOUBLE NOT NULL DEFAULT 10.0,
    `preOrderAdvanceRate` DOUBLE NOT NULL DEFAULT 30.0,
    `reservationsEnabled` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `CafeSettings_cafeId_key`(`cafeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffCall` (
    `id` VARCHAR(191) NOT NULL,
    `cafeId` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'WAITER_CALL',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `message` VARCHAR(191) NULL,
    `staffId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Table_cafeId_number_key` ON `Table`(`cafeId`, `number`);

-- AddForeignKey
ALTER TABLE `CafeSettings` ADD CONSTRAINT `CafeSettings_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Table` ADD CONSTRAINT `Table_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCall` ADD CONSTRAINT `StaffCall_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCall` ADD CONSTRAINT `StaffCall_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `Table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCall` ADD CONSTRAINT `StaffCall_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuItem` ADD CONSTRAINT `MenuItem_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
