ALTER TABLE `Payment`
    ADD COLUMN `provider` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `providerOrderId` VARCHAR(191) NULL,
    ADD COLUMN `providerPaymentId` VARCHAR(191) NULL,
    ADD COLUMN `providerSignature` VARCHAR(191) NULL,
    ADD COLUMN `webhookEventId` VARCHAR(191) NULL,
    ADD COLUMN `webhookPayload` TEXT NULL,
    ADD COLUMN `lastError` TEXT NULL,
    ADD COLUMN `webhookReceivedAt` DATETIME(3) NULL,
    ADD COLUMN `capturedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Payment_providerOrderId_key` ON `Payment`(`providerOrderId`);
CREATE UNIQUE INDEX `Payment_providerPaymentId_key` ON `Payment`(`providerPaymentId`);
CREATE UNIQUE INDEX `Payment_webhookEventId_key` ON `Payment`(`webhookEventId`);
