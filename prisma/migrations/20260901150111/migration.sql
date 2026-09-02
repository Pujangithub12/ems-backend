-- AlterTable
ALTER TABLE "proforma_invoice" ADD COLUMN     "bankAccountNumber" VARCHAR,
ADD COLUMN     "bankAddress" TEXT,
ADD COLUMN     "bankBeneficiaryName" VARCHAR,
ADD COLUMN     "bankName" VARCHAR,
ADD COLUMN     "bankSwiftCode" VARCHAR,
ADD COLUMN     "customerPan" VARCHAR,
ADD COLUMN     "deliveryTerms" VARCHAR,
ADD COLUMN     "modeOfShipment" VARCHAR,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "placeOfDischarge" VARCHAR,
ADD COLUMN     "placeOfLoading" VARCHAR,
ADD COLUMN     "taxPercent" DECIMAL,
ADD COLUMN     "vendorPan" VARCHAR;

-- AlterTable
ALTER TABLE "proforma_invoice_item" ADD COLUMN     "hsnCode" VARCHAR,
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;
