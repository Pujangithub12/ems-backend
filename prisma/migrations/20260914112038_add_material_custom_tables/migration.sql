-- CreateTable
CREATE TABLE "material_custom_table" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_custom_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_custom_column" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "dataType" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "target" DOUBLE PRECISION,

    CONSTRAINT "material_custom_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_custom_row" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_custom_row_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material_custom_table" ADD CONSTRAINT "material_custom_table_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_custom_table" ADD CONSTRAINT "material_custom_table_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_custom_column" ADD CONSTRAINT "material_custom_column_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "material_custom_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_custom_row" ADD CONSTRAINT "material_custom_row_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "material_custom_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
