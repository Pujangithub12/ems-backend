-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "createdById" INTEGER;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
