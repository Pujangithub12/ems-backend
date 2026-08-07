-- DropIndex
DROP INDEX "plant_daily_report_organizationId_date_key";

-- AlterTable
ALTER TABLE "plant_daily_report" ADD COLUMN     "projectId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "plant_daily_report_organizationId_projectId_date_key" ON "plant_daily_report"("organizationId", "projectId", "date");

-- AddForeignKey
ALTER TABLE "plant_daily_report" ADD CONSTRAINT "plant_daily_report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

