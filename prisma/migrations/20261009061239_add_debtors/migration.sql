-- CreateTable
CREATE TABLE "debtor_record" (
    "id" SERIAL NOT NULL,
    "debtorName" VARCHAR NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "referenceNumber" VARCHAR,
    "amountDue" DECIMAL NOT NULL,
    "currency" VARCHAR NOT NULL DEFAULT 'NPR',
    "paymentTerms" VARCHAR,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" INTEGER,
    "createdById" INTEGER,

    CONSTRAINT "debtor_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debtor_payment" (
    "id" SERIAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "receivedDate" DATE NOT NULL,
    "reference" VARCHAR,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "debtorId" INTEGER NOT NULL,
    "createdById" INTEGER,

    CONSTRAINT "debtor_payment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "debtor_record" ADD CONSTRAINT "debtor_record_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "debtor_record" ADD CONSTRAINT "debtor_record_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "debtor_payment" ADD CONSTRAINT "debtor_payment_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "debtor_record"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "debtor_payment" ADD CONSTRAINT "debtor_payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
