-- CreateTable
CREATE TABLE "purchase_table" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_column" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "dataType" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "target" DOUBLE PRECISION,

    CONSTRAINT "purchase_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_row" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_row_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "purchase_table" ADD CONSTRAINT "purchase_table_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_table" ADD CONSTRAINT "purchase_table_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_column" ADD CONSTRAINT "purchase_column_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "purchase_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_row" ADD CONSTRAINT "purchase_row_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "purchase_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

