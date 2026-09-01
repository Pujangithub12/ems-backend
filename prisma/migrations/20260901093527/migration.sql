/*
  Warnings:

  - You are about to drop the column `category` on the `plant_report_table` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "plant_report_table" DROP COLUMN "category";

-- CreateTable
CREATE TABLE "site_activity_report" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "reportDate" DATE NOT NULL,
    "location" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'submitted',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_activity_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_activity_item" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR NOT NULL,
    "chainage" VARCHAR,
    "todayQty" DOUBLE PRECISION,
    "unit" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'ongoing',
    "remarks" VARCHAR,

    CONSTRAINT "site_activity_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_activity_equipment" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "equipmentName" VARCHAR NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "workingHours" DOUBLE PRECISION,
    "condition" VARCHAR NOT NULL DEFAULT 'working',

    CONSTRAINT "site_activity_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_activity_manpower" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "role" VARCHAR NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "site_activity_manpower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_activity_photo" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "filePath" VARCHAR NOT NULL,
    "fileName" VARCHAR NOT NULL,
    "caption" VARCHAR,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_activity_photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_activity_report_projectId_reportDate_key" ON "site_activity_report"("projectId", "reportDate");

-- AddForeignKey
ALTER TABLE "site_activity_report" ADD CONSTRAINT "site_activity_report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_report" ADD CONSTRAINT "site_activity_report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_report" ADD CONSTRAINT "site_activity_report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_item" ADD CONSTRAINT "site_activity_item_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_equipment" ADD CONSTRAINT "site_activity_equipment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_manpower" ADD CONSTRAINT "site_activity_manpower_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_photo" ADD CONSTRAINT "site_activity_photo_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_photo" ADD CONSTRAINT "site_activity_photo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "site_activity_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
