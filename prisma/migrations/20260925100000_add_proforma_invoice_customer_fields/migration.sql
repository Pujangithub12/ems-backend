-- AlterTable
ALTER TABLE "proforma_invoice" ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerContact" VARCHAR,
ADD COLUMN     "customerContactPerson" VARCHAR,
ADD COLUMN     "customerEmail" VARCHAR,
ADD COLUMN     "customerName" VARCHAR;

