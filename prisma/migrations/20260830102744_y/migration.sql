-- AlterTable
ALTER TABLE "purchase_order_payment" ADD COLUMN     "manualRecordId" INTEGER;

-- CreateTable
CREATE TABLE "finance_manual_record" (
    "id" SERIAL NOT NULL,
    "vendorName" VARCHAR NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "referenceNumber" VARCHAR,
    "itemValue" DECIMAL NOT NULL,
    "paymentTerms" VARCHAR,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" INTEGER,
    "vendorId" INTEGER,
    "createdById" INTEGER,

    CONSTRAINT "finance_manual_record_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "purchase_order_payment" ADD CONSTRAINT "purchase_order_payment_manualRecordId_fkey" FOREIGN KEY ("manualRecordId") REFERENCES "finance_manual_record"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "finance_manual_record" ADD CONSTRAINT "finance_manual_record_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "finance_manual_record" ADD CONSTRAINT "finance_manual_record_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "finance_manual_record" ADD CONSTRAINT "finance_manual_record_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
