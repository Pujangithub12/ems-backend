-- AlterTable
ALTER TABLE "finance_manual_record" ADD COLUMN     "refundableMarginPercent" DECIMAL,
ADD COLUMN     "refundedAmount" DECIMAL;

-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "refundableMarginPercent" DECIMAL,
ADD COLUMN     "refundedAmount" DECIMAL;
