-- CreateTable
CREATE TABLE "purchase_order_payment" (
    "id" SERIAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paidDate" DATE NOT NULL,
    "reference" VARCHAR,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER,
    "createdById" INTEGER,

    CONSTRAINT "purchase_order_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_of_credit" (
    "id" SERIAL NOT NULL,
    "lcNumber" VARCHAR,
    "lcCharge" DECIMAL,
    "lcCommission" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipmentId" INTEGER,

    CONSTRAINT "letter_of_credit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "letter_of_credit_shipmentId_key" ON "letter_of_credit"("shipmentId");

-- AddForeignKey
ALTER TABLE "purchase_order_payment" ADD CONSTRAINT "purchase_order_payment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_payment" ADD CONSTRAINT "purchase_order_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "letter_of_credit" ADD CONSTRAINT "letter_of_credit_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
