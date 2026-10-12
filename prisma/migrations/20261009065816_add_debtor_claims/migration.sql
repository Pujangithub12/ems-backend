-- CreateTable
CREATE TABLE "debtor_claim" (
    "id" SERIAL NOT NULL,
    "debtorId" INTEGER NOT NULL,
    "purpose" VARCHAR,
    "commercialInvoiceNo" VARCHAR,
    "claimAmount" DECIMAL NOT NULL DEFAULT 0,
    "claimReceived" DECIMAL NOT NULL DEFAULT 0,
    "reimbursementPurpose" VARCHAR,
    "reimbursementAmount" DECIMAL NOT NULL DEFAULT 0,
    "reimbursementReceived" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debtor_claim_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "debtor_claim" ADD CONSTRAINT "debtor_claim_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "debtor_record"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
