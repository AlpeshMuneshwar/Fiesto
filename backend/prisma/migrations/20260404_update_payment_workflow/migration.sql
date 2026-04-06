-- Update Payment model to support the new workflow
-- This migration adds fields for payment acknowledgment and email receipt tracking

ALTER TABLE `Payment` ADD COLUMN `acknowledgedAt` DATETIME NULL;
ALTER TABLE `Payment` ADD COLUMN `acknowledgedBy` VARCHAR(191) NULL;
ALTER TABLE `Payment` ADD COLUMN `billEmail` VARCHAR(191) NULL;
ALTER TABLE `Payment` ADD COLUMN `emailSentAt` DATETIME NULL;
ALTER TABLE `Payment` ADD COLUMN `paymentStage` VARCHAR(191) NOT NULL DEFAULT 'PENDING';

-- Update Order model to support AWAITING_PICKUP status
-- This is handled automatically in schema but migration ensures schema consistency

-- Add index for payment status lookups
CREATE INDEX `idx_payment_status_stage` ON `Payment`(`status`, `paymentStage`);
