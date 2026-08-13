-- AlterTable
ALTER TABLE "plant_daily_report" ADD COLUMN     "customValues" JSONB;

-- CreateTable
CREATE TABLE "plant_report_custom_field" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "dataType" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_report_custom_field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plant_report_custom_field_organizationId_name_key" ON "plant_report_custom_field"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "plant_report_custom_field" ADD CONSTRAINT "plant_report_custom_field_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
