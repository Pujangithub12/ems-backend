/*
  Warnings:

  - You are about to drop the `purchase_order_attachment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "purchase_order_attachment" DROP CONSTRAINT "purchase_order_attachment_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_attachment" DROP CONSTRAINT "purchase_order_attachment_uploadedById_fkey";

-- DropTable
DROP TABLE "purchase_order_attachment";
