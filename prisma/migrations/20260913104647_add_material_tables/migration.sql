-- CreateTable
CREATE TABLE "material_table" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_column" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "dataType" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "target" DOUBLE PRECISION,

    CONSTRAINT "material_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_row" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_row_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material_table" ADD CONSTRAINT "material_table_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_table" ADD CONSTRAINT "material_table_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_column" ADD CONSTRAINT "material_column_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "material_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_row" ADD CONSTRAINT "material_row_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "material_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
