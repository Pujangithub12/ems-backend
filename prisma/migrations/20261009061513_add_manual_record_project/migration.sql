-- AlterTable
ALTER TABLE "finance_manual_record" ADD COLUMN     "projectId" INTEGER;

-- AddForeignKey
ALTER TABLE "finance_manual_record" ADD CONSTRAINT "finance_manual_record_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
