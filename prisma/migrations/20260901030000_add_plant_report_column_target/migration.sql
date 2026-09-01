-- Optional flat target value per column, for the Charts tab's expected-vs-actual comparison.

-- AlterTable
ALTER TABLE "plant_report_column" ADD COLUMN     "target" DOUBLE PRECISION;
