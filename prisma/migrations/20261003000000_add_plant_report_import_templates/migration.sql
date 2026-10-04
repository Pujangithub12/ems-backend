-- CreateTable
CREATE TABLE "plant_report_import_template" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "headers" JSONB NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_report_import_template_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "plant_report_import_template" ADD CONSTRAINT "plant_report_import_template_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "plant_report_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
