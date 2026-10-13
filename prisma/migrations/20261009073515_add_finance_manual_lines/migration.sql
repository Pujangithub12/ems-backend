-- CreateTable
CREATE TABLE "finance_manual_line" (
    "id" SERIAL NOT NULL,
    "manualRecordId" INTEGER NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "majorCost" DECIMAL NOT NULL DEFAULT 0,
    "freight" DECIMAL NOT NULL DEFAULT 0,
    "lcNumber" VARCHAR,
    "lcAmount" DECIMAL NOT NULL DEFAULT 0,
    "lcCharge" DECIMAL NOT NULL DEFAULT 0,
    "lcCommission" DECIMAL NOT NULL DEFAULT 0,
    "vat" DECIMAL NOT NULL DEFAULT 0,
    "importDuties" DECIMAL NOT NULL DEFAULT 0,
    "insurance" DECIMAL NOT NULL DEFAULT 0,
    "bibini" DECIMAL NOT NULL DEFAULT 0,
    "otherMargin" DECIMAL NOT NULL DEFAULT 0,
    "refundableAmount" DECIMAL NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_manual_line_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "finance_manual_line" ADD CONSTRAINT "finance_manual_line_manualRecordId_fkey" FOREIGN KEY ("manualRecordId") REFERENCES "finance_manual_record"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
