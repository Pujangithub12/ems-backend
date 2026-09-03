-- AlterTable
ALTER TABLE "proforma_invoice" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "organizationId" INTEGER,
ADD COLUMN     "vendorAddress" TEXT,
ADD COLUMN     "vendorContact" VARCHAR,
ADD COLUMN     "vendorContactPerson" VARCHAR,
ADD COLUMN     "vendorEmail" VARCHAR,
ADD COLUMN     "vendorId" INTEGER,
ADD COLUMN     "vendorName" VARCHAR;

-- AddForeignKey
ALTER TABLE "proforma_invoice" ADD CONSTRAINT "proforma_invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proforma_invoice" ADD CONSTRAINT "proforma_invoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proforma_invoice" ADD CONSTRAINT "proforma_invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;


-- Backfill organizationId for existing PO-backed proforma invoices so org-scoping doesn't rely
-- solely on the (now-optional) purchaseOrder relation going forward.
UPDATE "proforma_invoice" pi
SET "organizationId" = po."organizationId"
FROM "purchase_order" po
WHERE pi."purchaseOrderId" = po."id" AND pi."organizationId" IS NULL;
