-- AlterTable
ALTER TABLE "daily_generation" ADD COLUMN     "checkMeterFinal" DECIMAL,
ADD COLUMN     "checkMeterInitial" DECIMAL,
ADD COLUMN     "mainMeterFinal" DECIMAL,
ADD COLUMN     "mainMeterInitial" DECIMAL;
