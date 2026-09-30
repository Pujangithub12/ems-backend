-- DropForeignKey
ALTER TABLE "purchase_order_technical_spec" DROP CONSTRAINT "purchase_order_technical_spec_purchaseOrderId_fkey";

-- DropTable
DROP TABLE "purchase_order_technical_spec";

-- CreateTable
CREATE TABLE "purchase_order_spec_table" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "footerNote" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER NOT NULL,

    CONSTRAINT "purchase_order_spec_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_spec_table_row" (
    "id" SERIAL NOT NULL,
    "cells" JSONB NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "specTableId" INTEGER NOT NULL,

    CONSTRAINT "purchase_order_spec_table_row_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "purchase_order_spec_table" ADD CONSTRAINT "purchase_order_spec_table_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_spec_table_row" ADD CONSTRAINT "purchase_order_spec_table_row_specTableId_fkey" FOREIGN KEY ("specTableId") REFERENCES "purchase_order_spec_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
