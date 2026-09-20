-- DropForeignKey
ALTER TABLE "purchase_column" DROP CONSTRAINT "purchase_column_tableId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_row" DROP CONSTRAINT "purchase_row_tableId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_table" DROP CONSTRAINT "purchase_table_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_table" DROP CONSTRAINT "purchase_table_projectId_fkey";

-- DropTable
DROP TABLE "purchase_column";

-- DropTable
DROP TABLE "purchase_row";

-- DropTable
DROP TABLE "purchase_table";

-- CreateTable
CREATE TABLE "purchase_bill" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "billNo" VARCHAR,
    "challanNo" VARCHAR,
    "vendorId" INTEGER,
    "vendorName" VARCHAR NOT NULL,
    "material" VARCHAR NOT NULL,
    "unit" VARCHAR,
    "quantity" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 13,
    "actualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vehicleNo" VARCHAR,
    "paymentMode" VARCHAR NOT NULL DEFAULT 'credit',
    "paidBy" VARCHAR,
    "billStatus" VARCHAR NOT NULL DEFAULT 'pending',
    "site" VARCHAR,
    "remarks" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_bill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_bill_organizationId_projectId_date_idx" ON "purchase_bill"("organizationId", "projectId", "date");

-- AddForeignKey
ALTER TABLE "purchase_bill" ADD CONSTRAINT "purchase_bill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill" ADD CONSTRAINT "purchase_bill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill" ADD CONSTRAINT "purchase_bill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_bill" ADD CONSTRAINT "purchase_bill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

