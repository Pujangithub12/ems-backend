-- CreateTable
CREATE TABLE "purchase_order_technical_spec" (
    "id" SERIAL NOT NULL,
    "specification" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER NOT NULL,

    CONSTRAINT "purchase_order_technical_spec_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "purchase_order_technical_spec" ADD CONSTRAINT "purchase_order_technical_spec_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
