ALTER TABLE `CafeSettings`
    ADD COLUMN `orderRoutingMode` VARCHAR(191) NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN `directAdminChefAppEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `preorderPaymentWindowMinutes` INTEGER NOT NULL DEFAULT 60;

ALTER TABLE `Order`
    ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvalExpiresAt` DATETIME(3) NULL;

