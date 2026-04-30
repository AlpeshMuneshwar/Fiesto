-- DropForeignKey
ALTER TABLE `Session` DROP FOREIGN KEY `Session_tableId_fkey`;

-- DropForeignKey
ALTER TABLE `StaffCall` DROP FOREIGN KEY `StaffCall_tableId_fkey`;

-- DropIndex
DROP INDEX `NearbyCafeRequest_city_idx` ON `NearbyCafeRequest`;

-- DropIndex
DROP INDEX `NearbyCafeRequest_createdAt_idx` ON `NearbyCafeRequest`;

-- DropIndex
DROP INDEX `idx_payment_status_stage` ON `Payment`;

-- AlterTable
ALTER TABLE `Cafe` ADD COLUMN `coverImage` VARCHAR(191) NULL,
    ADD COLUMN `galleryImages` TEXT NULL;

-- AlterTable
ALTER TABLE `CafeSettings` MODIFY `preOrderAdvanceRate` DOUBLE NOT NULL DEFAULT 40.0;

-- AlterTable
ALTER TABLE `Payment` MODIFY `acknowledgedAt` DATETIME(3) NULL,
    MODIFY `emailSentAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Session` MODIFY `tableId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `StaffCall` MODIFY `tableId` VARCHAR(191) NULL;

-- AddForeignKey
-- Skipping foreign key addition for NearbyCafeRequest due to prior issues; application handles relationship without DB constraint

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `Table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffCall` ADD CONSTRAINT `StaffCall_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `Table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
