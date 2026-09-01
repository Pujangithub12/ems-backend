-- Plant Report redesign: replaces the entire old fixed-shape feature
-- (Daily Log header + 7 child tables + forms + custom fields + work items)
-- with a generic project-scoped custom-table system (tabs, user-defined
-- columns, rows). Intentional full removal per request — no data migration.

-- DropForeignKey
ALTER TABLE "daily_report_activity" DROP CONSTRAINT "daily_report_activity_reportId_fkey";

-- DropForeignKey
ALTER TABLE "daily_report_activity" DROP CONSTRAINT "daily_report_activity_workItemId_fkey";

-- DropForeignKey
ALTER TABLE "daily_report_activity_photo" DROP CONSTRAINT "daily_report_activity_photo_activityId_fkey";

-- DropForeignKey
ALTER TABLE "daily_report_activity_photo" DROP CONSTRAINT "daily_report_activity_photo_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "plant_daily_report" DROP CONSTRAINT "plant_daily_report_createdById_fkey";

-- DropForeignKey
ALTER TABLE "plant_daily_report" DROP CONSTRAINT "plant_daily_report_formId_fkey";

-- DropForeignKey
ALTER TABLE "plant_daily_report" DROP CONSTRAINT "plant_daily_report_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "plant_daily_report" DROP CONSTRAINT "plant_daily_report_preparedById_fkey";

-- DropForeignKey
ALTER TABLE "plant_daily_report" DROP CONSTRAINT "plant_daily_report_projectId_fkey";

-- DropForeignKey
ALTER TABLE "plant_report_custom_field" DROP CONSTRAINT "plant_report_custom_field_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "plant_report_form" DROP CONSTRAINT "plant_report_form_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "plant_work_item" DROP CONSTRAINT "plant_work_item_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "plant_work_item" DROP CONSTRAINT "plant_work_item_projectId_fkey";

-- DropForeignKey
ALTER TABLE "report_equipment" DROP CONSTRAINT "report_equipment_reportId_fkey";

-- DropForeignKey
ALTER TABLE "report_instruction" DROP CONSTRAINT "report_instruction_reportId_fkey";

-- DropForeignKey
ALTER TABLE "report_manpower" DROP CONSTRAINT "report_manpower_reportId_fkey";

-- DropForeignKey
ALTER TABLE "report_material" DROP CONSTRAINT "report_material_reportId_fkey";

-- DropForeignKey
ALTER TABLE "report_safety" DROP CONSTRAINT "report_safety_reportId_fkey";

-- DropForeignKey
ALTER TABLE "report_weather" DROP CONSTRAINT "report_weather_reportId_fkey";

-- DropTable
DROP TABLE "daily_report_activity";

-- DropTable
DROP TABLE "daily_report_activity_photo";

-- DropTable
DROP TABLE "plant_daily_report";

-- DropTable
DROP TABLE "plant_report_custom_field";

-- DropTable
DROP TABLE "plant_report_form";

-- DropTable
DROP TABLE "plant_work_item";

-- DropTable
DROP TABLE "report_equipment";

-- DropTable
DROP TABLE "report_instruction";

-- DropTable
DROP TABLE "report_manpower";

-- DropTable
DROP TABLE "report_material";

-- DropTable
DROP TABLE "report_safety";

-- DropTable
DROP TABLE "report_weather";

-- CreateTable
CREATE TABLE "plant_report_table" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_report_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_report_column" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "dataType" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plant_report_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_report_row" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plant_report_row_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "plant_report_table" ADD CONSTRAINT "plant_report_table_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_report_table" ADD CONSTRAINT "plant_report_table_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_report_column" ADD CONSTRAINT "plant_report_column_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "plant_report_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_report_row" ADD CONSTRAINT "plant_report_row_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "plant_report_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
