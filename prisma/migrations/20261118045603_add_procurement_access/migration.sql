-- CreateTable
CREATE TABLE "procurement_access" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER,
    "proformaInvoiceId" INTEGER,
    "userId" INTEGER NOT NULL,
    "level" VARCHAR NOT NULL DEFAULT 'view',
    "grantedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_access_userId_idx" ON "procurement_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_access_purchaseOrderId_userId_key" ON "procurement_access"("purchaseOrderId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_access_proformaInvoiceId_userId_key" ON "procurement_access"("proformaInvoiceId", "userId");

-- AddForeignKey
ALTER TABLE "procurement_access" ADD CONSTRAINT "procurement_access_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_access" ADD CONSTRAINT "procurement_access_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoice"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_access" ADD CONSTRAINT "procurement_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_access" ADD CONSTRAINT "procurement_access_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
