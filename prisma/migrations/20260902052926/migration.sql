/*
  Warnings:

  - You are about to drop the column `refundableMarginPercent` on the `finance_manual_record` table. All the data in the column will be lost.
  - You are about to drop the column `refundableMarginPercent` on the `purchase_order_item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "finance_manual_record" DROP COLUMN "refundableMarginPercent",
ADD COLUMN     "currency" VARCHAR NOT NULL DEFAULT 'NPR';

-- AlterTable
ALTER TABLE "purchase_order_item" DROP COLUMN "refundableMarginPercent";
