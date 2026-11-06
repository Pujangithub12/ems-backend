-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "rate" DECIMAL,
ADD COLUMN     "unitWeight" DECIMAL,
ADD COLUMN     "weightUnit" VARCHAR;
