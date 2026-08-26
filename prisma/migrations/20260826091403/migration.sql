/*
  Warnings:

  - You are about to drop the column `deliveryAddress` on the `purchase_order` table. All the data in the column will be lost.
  - You are about to drop the column `shippingTerms` on the `purchase_order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "catalog_item" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "purchase_order" DROP COLUMN "deliveryAddress",
DROP COLUMN "shippingTerms",
ADD COLUMN     "customerContactPerson" TEXT;
