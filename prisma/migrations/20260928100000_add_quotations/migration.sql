-- CreateTable
CREATE TABLE "quotation" (
    "id" SERIAL NOT NULL,
    "quotationNumber" VARCHAR,
    "quotationDate" DATE,
    "title" VARCHAR,
    "fromPan" VARCHAR,
    "regNo" VARCHAR,
    "customerName" VARCHAR,
    "customerAddress" TEXT,
    "customerContact" VARCHAR,
    "customerEmail" VARCHAR,
    "priceBasis" VARCHAR,
    "deliveryPeriod" VARCHAR,
    "paymentTerms" VARCHAR,
    "validityPeriod" VARCHAR,
    "taxPercent" DECIMAL,
    "signatoryName" VARCHAR,
    "signatoryDesignation" VARCHAR,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" INTEGER,
    "createdById" INTEGER,

    CONSTRAINT "quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_item" (
    "id" SERIAL NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" VARCHAR,
    "rate" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quotationId" INTEGER,

    CONSTRAINT "quotation_item_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quotation_item" ADD CONSTRAINT "quotation_item_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotation"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

