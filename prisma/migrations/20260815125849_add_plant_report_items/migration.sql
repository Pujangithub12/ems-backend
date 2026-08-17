-- CreateTable
CREATE TABLE "plant_report_item" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "unit" VARCHAR NOT NULL,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_report_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_report_item_entry" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "openingStock" DECIMAL(12,3),
    "receivedQty" DECIMAL(12,3),
    "usedQty" DECIMAL(12,3),
    "note" TEXT,

    CONSTRAINT "plant_report_item_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plant_report_item_organizationId_name_key" ON "plant_report_item"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "plant_report_item_entry_reportId_itemId_key" ON "plant_report_item_entry"("reportId", "itemId");

-- AddForeignKey
ALTER TABLE "plant_report_item" ADD CONSTRAINT "plant_report_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_report_item_entry" ADD CONSTRAINT "plant_report_item_entry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_report_item_entry" ADD CONSTRAINT "plant_report_item_entry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "plant_report_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
