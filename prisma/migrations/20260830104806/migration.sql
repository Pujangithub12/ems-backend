-- AlterTable
ALTER TABLE "finance_manual_record" ADD COLUMN     "freight" DECIMAL,
ADD COLUMN     "lcCharge" DECIMAL,
ADD COLUMN     "lcCommission" DECIMAL,
ADD COLUMN     "lcNumber" VARCHAR,
ADD COLUMN     "vat" DECIMAL;

-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "freightOverride" DECIMAL,
ADD COLUMN     "lcChargeOverride" DECIMAL,
ADD COLUMN     "lcCommissionOverride" DECIMAL,
ADD COLUMN     "vatOverride" DECIMAL;
