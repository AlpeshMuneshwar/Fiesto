-- Add cafe contact phone and customer phone numbers
ALTER TABLE `Cafe`
    ADD COLUMN `contactPhone` VARCHAR(191) NULL;

ALTER TABLE `User`
    ADD COLUMN `phoneNumber` VARCHAR(191) NULL;
