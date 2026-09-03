-- AlterTable
ALTER TABLE "finance_manual_record" ADD COLUMN     "importDuties" DECIMAL,
ADD COLUMN     "insurance" DECIMAL;

-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "importDutiesOverride" DECIMAL,
ADD COLUMN     "insuranceOverride" DECIMAL;

