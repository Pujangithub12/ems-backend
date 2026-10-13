-- AlterTable
ALTER TABLE "finance_manual_line" ADD COLUMN     "lineDate" DATE;

-- AlterTable
ALTER TABLE "finance_manual_record" ADD COLUMN     "lineDate" DATE;

-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "lineDate" DATE;
