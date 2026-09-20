-- DropForeignKey
ALTER TABLE "material_column" DROP CONSTRAINT "material_column_tableId_fkey";

-- DropForeignKey
ALTER TABLE "material_row" DROP CONSTRAINT "material_row_tableId_fkey";

-- DropForeignKey
ALTER TABLE "material_table" DROP CONSTRAINT "material_table_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "material_table" DROP CONSTRAINT "material_table_projectId_fkey";

-- DropTable
DROP TABLE "material_column";

-- DropTable
DROP TABLE "material_row";

-- DropTable
DROP TABLE "material_table";

-- CreateTable
CREATE TABLE "material" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "code" VARCHAR,
    "category" VARCHAR,
    "unit" VARCHAR NOT NULL,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vendorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_transaction" (
    "id" SERIAL NOT NULL,
    "materialId" INTEGER NOT NULL,
    "type" VARCHAR NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "vendorId" INTEGER,
    "unitPrice" DOUBLE PRECISION,
    "workArea" VARCHAR,
    "issuedTo" VARCHAR,
    "reference" VARCHAR,
    "remarks" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_transaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material" ADD CONSTRAINT "material_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_transaction" ADD CONSTRAINT "material_transaction_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_transaction" ADD CONSTRAINT "material_transaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "material_transaction" ADD CONSTRAINT "material_transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
