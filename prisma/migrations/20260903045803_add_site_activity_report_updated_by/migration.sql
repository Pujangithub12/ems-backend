-- AlterTable
ALTER TABLE "site_activity_report" ADD COLUMN     "updatedById" INTEGER;

-- AddForeignKey
ALTER TABLE "site_activity_report" ADD CONSTRAINT "site_activity_report_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

