-- Removes Plant Report's draft/submitted/approved workflow, per request.
-- Reports no longer have a status; preparedBy stays (who filled it out is a
-- separate concept from an approval decision).

-- DropForeignKey
ALTER TABLE "plant_daily_report" DROP CONSTRAINT "plant_daily_report_approvedById_fkey";

-- AlterTable
ALTER TABLE "plant_daily_report" DROP COLUMN "approvedAt",
DROP COLUMN "approvedById",
DROP COLUMN "status";
