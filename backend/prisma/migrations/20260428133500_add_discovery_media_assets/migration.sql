-- AlterTable
ALTER TABLE `Cafe`
    ADD COLUMN `googleMapsUrl` VARCHAR(2048) NULL;

-- CreateTable
CREATE TABLE `CafeDiscoveryAsset` (
    `id` VARCHAR(191) NOT NULL,
    `cafeId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `mimeType` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(255) NULL,
    `byteSize` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `updatedBy` VARCHAR(191) NULL,

    INDEX `CafeDiscoveryAsset_cafeId_kind_sortOrder_idx`(`cafeId`, `kind`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CafeDiscoveryAsset`
    ADD CONSTRAINT `CafeDiscoveryAsset_cafeId_fkey`
    FOREIGN KEY (`cafeId`) REFERENCES `Cafe`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
