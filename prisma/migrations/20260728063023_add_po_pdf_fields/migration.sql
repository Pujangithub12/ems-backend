-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "deliveryPeriod" TEXT,
ADD COLUMN     "finalDestination" TEXT,
ADD COLUMN     "shippingTerms" TEXT;

-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "hsnCode" VARCHAR;

-- AlterTable
ALTER TABLE "vendor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactPerson" VARCHAR,
ADD COLUMN     "email" VARCHAR;
