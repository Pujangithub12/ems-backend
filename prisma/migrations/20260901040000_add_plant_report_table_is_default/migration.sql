-- Marks the auto-seeded "Progress Tracker" tab as permanent (can't be renamed/deleted).

-- AlterTable
ALTER TABLE "plant_report_table" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any existing table literally named "Progress Tracker" was the
-- auto-seeded default tab (see PlantReportTableController.list), so mark it.
UPDATE "plant_report_table" SET "isDefault" = true WHERE "name" = 'Progress Tracker';
