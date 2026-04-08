/*
  Warnings:

  - Added the required column `updatedAt` to the `CafeSettings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `VerificationToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Cafe` ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `CafeSettings` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `gstNumber` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MenuItem` ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `chefId` VARCHAR(191) NULL,
    ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Session` ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `StaffCall` ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Table` ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `desc` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `createdBy` VARCHAR(191) NULL,
    ADD COLUMN `updatedBy` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `VerificationToken` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `cafeId` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NULL,
    `role` VARCHAR(191) NULL,
    `actionType` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NULL,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_chefId_fkey` FOREIGN KEY (`chefId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_cafeId_fkey` FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
