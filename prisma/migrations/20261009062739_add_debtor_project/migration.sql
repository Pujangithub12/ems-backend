-- AlterTable
ALTER TABLE "debtor_record" ADD COLUMN     "projectId" INTEGER;

-- AddForeignKey
ALTER TABLE "debtor_record" ADD CONSTRAINT "debtor_record_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
