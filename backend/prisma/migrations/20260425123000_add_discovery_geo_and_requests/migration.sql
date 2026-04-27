ALTER TABLE `Cafe`
    ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `featuredPriority` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `NearbyCafeRequest` (
    `id` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `locality` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `note` VARCHAR(191) NULL,
    `customerEmail` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'DISCOVERY_APP',
    `cafeId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
);

CREATE INDEX `NearbyCafeRequest_city_idx` ON `NearbyCafeRequest`(`city`);
CREATE INDEX `NearbyCafeRequest_createdAt_idx` ON `NearbyCafeRequest`(`createdAt`);
