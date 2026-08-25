/*
  Warnings:

  - You are about to drop the column `burnerHours` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `burnerStatus` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `feedwaterTemp` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `pelletReceivedKg` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `pelletStockOpening` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `pelletUsedKg` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `pelletsBag` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `shutdownReason` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `steamFinal` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `steamInitial` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `steamPressure` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `steamTemp` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `waterFinal` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `waterInitial` on the `plant_daily_report` table. All the data in the column will be lost.
  - You are about to drop the column `purchaseRequestId` on the `purchase_order` table. All the data in the column will be lost.
  - You are about to drop the `plant_report_item` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `plant_report_item_entry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_request` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_request_attachment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_request_item` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_request_status_history` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vendor_quote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "plant_report_item" DROP CONSTRAINT "plant_report_item_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "plant_report_item_entry" DROP CONSTRAINT "plant_report_item_entry_itemId_fkey";

-- DropForeignKey
ALTER TABLE "plant_report_item_entry" DROP CONSTRAINT "plant_report_item_entry_reportId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order" DROP CONSTRAINT "purchase_order_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request" DROP CONSTRAINT "purchase_request_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request" DROP CONSTRAINT "purchase_request_projectId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request" DROP CONSTRAINT "purchase_request_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_attachment" DROP CONSTRAINT "purchase_request_attachment_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_attachment" DROP CONSTRAINT "purchase_request_attachment_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_item" DROP CONSTRAINT "purchase_request_item_itemId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_item" DROP CONSTRAINT "purchase_request_item_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_status_history" DROP CONSTRAINT "purchase_request_status_history_changedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_request_status_history" DROP CONSTRAINT "purchase_request_status_history_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_quote" DROP CONSTRAINT "vendor_quote_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_quote" DROP CONSTRAINT "vendor_quote_vendorId_fkey";

-- DropIndex
DROP INDEX "purchase_order_purchaseRequestId_key";

-- AlterTable
ALTER TABLE "plant_daily_report" DROP COLUMN "burnerHours",
DROP COLUMN "burnerStatus",
DROP COLUMN "feedwaterTemp",
DROP COLUMN "pelletReceivedKg",
DROP COLUMN "pelletStockOpening",
DROP COLUMN "pelletUsedKg",
DROP COLUMN "pelletsBag",
DROP COLUMN "shutdownReason",
DROP COLUMN "steamFinal",
DROP COLUMN "steamInitial",
DROP COLUMN "steamPressure",
DROP COLUMN "steamTemp",
DROP COLUMN "waterFinal",
DROP COLUMN "waterInitial";

-- AlterTable
ALTER TABLE "purchase_order" DROP COLUMN "purchaseRequestId",
ADD COLUMN     "approvalStatus" VARCHAR NOT NULL DEFAULT 'pending_approval',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" INTEGER;

-- DropTable
DROP TABLE "plant_report_item";

-- DropTable
DROP TABLE "plant_report_item_entry";

-- DropTable
DROP TABLE "purchase_request";

-- DropTable
DROP TABLE "purchase_request_attachment";

-- DropTable
DROP TABLE "purchase_request_item";

-- DropTable
DROP TABLE "purchase_request_status_history";

-- DropTable
DROP TABLE "vendor_quote";

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
