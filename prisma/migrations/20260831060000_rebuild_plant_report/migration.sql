-- Hand-edited (not auto-generated as-is): the auto-generated diff dropped
-- plant_daily_report.date and re-added a required reportDate column, which
-- Prisma refuses to run against the 2 existing rows and which would also
-- silently drop plant_report_staff's 3 rows. This version renames the
-- column (preserving existing report dates) and backfills the old
-- per-row staff assignments into the new category-based report_manpower
-- table before dropping plant_report_staff.

-- CreateTable
CREATE TABLE "plant_report_form" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "slug" VARCHAR NOT NULL,
    "activityHasDimensions" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_report_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_activity" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "workItemId" INTEGER,
    "description" TEXT NOT NULL,
    "locationChainage" VARCHAR,
    "lengthM" DOUBLE PRECISION,
    "widthM" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "areaSqm" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "unit" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'ongoing',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_report_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_activity_photo" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "fileName" VARCHAR NOT NULL,
    "filePath" VARCHAR NOT NULL,
    "uploadedById" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_report_activity_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_manpower" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "category" VARCHAR NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "userIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "remarks" TEXT,

    CONSTRAINT "report_manpower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_equipment" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "equipmentName" VARCHAR NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "workingHours" DOUBLE PRECISION,
    "condition" VARCHAR NOT NULL DEFAULT 'working',
    "remarks" TEXT,

    CONSTRAINT "report_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_weather" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "slot" VARCHAR NOT NULL,
    "condition" VARCHAR,
    "tempC" DOUBLE PRECISION,
    "rainfall" VARCHAR,

    CONSTRAINT "report_weather_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_material" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "materialType" VARCHAR NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" VARCHAR,
    "receivedAtSite" BOOLEAN NOT NULL DEFAULT false,
    "usedAtSite" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,

    CONSTRAINT "report_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_safety" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "type" VARCHAR NOT NULL,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,

    CONSTRAINT "report_safety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_instruction" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "byWhom" VARCHAR,
    "toWhom" VARCHAR,
    "time" TIME,
    "signature" VARCHAR,

    CONSTRAINT "report_instruction_pkey" PRIMARY KEY ("id")
);

-- AlterTable: rename date -> reportDate instead of drop+add, so the 2
-- existing rows keep their date instead of violating NOT NULL.
ALTER TABLE "plant_daily_report" RENAME COLUMN "date" TO "reportDate";

ALTER TABLE "plant_daily_report"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" INTEGER,
  ADD COLUMN "formId" INTEGER,
  ADD COLUMN "location" VARCHAR,
  ADD COLUMN "preparedById" INTEGER,
  ADD COLUMN "remarks" TEXT,
  ADD COLUMN "status" VARCHAR NOT NULL DEFAULT 'draft';

-- Backfill: fold the old one-row-per-staff-member rows into a single
-- "other" category manpower row per report, so the 3 existing
-- plant_report_staff rows aren't silently discarded.
INSERT INTO "report_manpower" ("reportId", "category", "headcount", "userIds", "remarks")
SELECT "reportId", 'other', COUNT(*)::INTEGER, ARRAY_AGG("userId"), 'Migrated from previous staff list'
FROM "plant_report_staff"
GROUP BY "reportId";

-- DropForeignKey
ALTER TABLE "plant_report_staff" DROP CONSTRAINT "plant_report_staff_reportId_fkey";
ALTER TABLE "plant_report_staff" DROP CONSTRAINT "plant_report_staff_userId_fkey";

-- DropTable
DROP TABLE "plant_report_staff";

-- DropIndex (old unique didn't include formId/reportDate shape we need now)
DROP INDEX "plant_daily_report_organizationId_projectId_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "plant_report_form_organizationId_slug_key" ON "plant_report_form"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "report_weather_reportId_slot_key" ON "report_weather"("reportId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "plant_daily_report_projectId_formId_reportDate_key" ON "plant_daily_report"("projectId", "formId", "reportDate");

-- AddForeignKey
ALTER TABLE "plant_report_form" ADD CONSTRAINT "plant_report_form_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_daily_report" ADD CONSTRAINT "plant_daily_report_formId_fkey" FOREIGN KEY ("formId") REFERENCES "plant_report_form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_daily_report" ADD CONSTRAINT "plant_daily_report_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_daily_report" ADD CONSTRAINT "plant_daily_report_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_activity" ADD CONSTRAINT "daily_report_activity_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_activity_photo" ADD CONSTRAINT "daily_report_activity_photo_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "daily_report_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_activity_photo" ADD CONSTRAINT "daily_report_activity_photo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_manpower" ADD CONSTRAINT "report_manpower_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_equipment" ADD CONSTRAINT "report_equipment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_weather" ADD CONSTRAINT "report_weather_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_material" ADD CONSTRAINT "report_material_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_safety" ADD CONSTRAINT "report_safety_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_instruction" ADD CONSTRAINT "report_instruction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
