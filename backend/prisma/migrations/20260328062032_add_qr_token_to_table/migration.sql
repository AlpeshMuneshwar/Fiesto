/*
/*
  Warnings:

  - A unique constraint covering the columns `[qrToken]` on the table `Table` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `table` ADD COLUMN `qrToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Table_qrToken_key` ON `Table`(`qrToken`);
