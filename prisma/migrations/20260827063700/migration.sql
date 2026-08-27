/*
  Warnings:

  - You are about to drop the column `description` on the `catalog_item` table. All the data in the column will be lost.
  - You are about to drop the column `approvalStatus` on the `purchase_order` table. All the data in the column will be lost.
  - You are about to drop the column `approvedAt` on the `purchase_order` table. All the data in the column will be lost.
  - You are about to drop the column `approvedById` on the `purchase_order` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `purchase_order_item` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "purchase_order" DROP CONSTRAINT "purchase_order_approvedById_fkey";

-- AlterTable
ALTER TABLE "catalog_item" DROP COLUMN "description";

-- AlterTable
ALTER TABLE "purchase_order" DROP COLUMN "approvalStatus",
DROP COLUMN "approvedAt",
DROP COLUMN "approvedById";

-- AlterTable
ALTER TABLE "purchase_order_item" DROP COLUMN "notes",
ADD COLUMN     "description" TEXT;
