-- Add order_type field to Order model and update preOrderAdvanceRate default
ALTER TABLE `Order` ADD COLUMN `orderType` VARCHAR(191) NOT NULL DEFAULT 'DINE_IN';

-- Update default preOrderAdvanceRate to 40%
UPDATE `CafeSettings` SET `preOrderAdvanceRate` = 40.0 WHERE `preOrderAdvanceRate` = 30.0;