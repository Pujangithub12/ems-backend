-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "itemColumns" JSONB;

-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "customValues" JSONB;
