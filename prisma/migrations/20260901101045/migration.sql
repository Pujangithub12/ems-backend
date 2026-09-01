/*
  Warnings:

  - You are about to drop the `report_activity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `report_comment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "report_activity" DROP CONSTRAINT "FK_074a26e93f27863800f8ce9fa34";

-- DropForeignKey
ALTER TABLE "report_activity" DROP CONSTRAINT "FK_2bf2938d0954fbf9e93c856b42a";

-- DropForeignKey
ALTER TABLE "report_comment" DROP CONSTRAINT "FK_2097fe196bdac816d6ee6244982";

-- DropForeignKey
ALTER TABLE "report_comment" DROP CONSTRAINT "FK_69a91a4269c5563e91aca8059a6";

-- DropTable
DROP TABLE "report_activity";

-- DropTable
DROP TABLE "report_comment";

-- CreateTable
CREATE TABLE "site_activity_weather" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "slot" VARCHAR NOT NULL,
    "condition" VARCHAR,
    "tempC" DOUBLE PRECISION,
    "rainfall" VARCHAR,
    "remarks" VARCHAR,

    CONSTRAINT "site_activity_weather_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_activity_material" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "materialType" VARCHAR NOT NULL,
    "quantity" DOUBLE PRECISION,
    "receivedAtSite" BOOLEAN NOT NULL DEFAULT false,
    "usedAtSite" BOOLEAN NOT NULL DEFAULT false,
    "unit" VARCHAR,
    "remarks" VARCHAR,

    CONSTRAINT "site_activity_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_activity_safety" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" VARCHAR NOT NULL,
    "description" VARCHAR,
    "actionTaken" VARCHAR,

    CONSTRAINT "site_activity_safety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_activity_instruction" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR,
    "byWhom" VARCHAR,
    "toWhom" VARCHAR,
    "time" VARCHAR,
    "signatureOf" VARCHAR,

    CONSTRAINT "site_activity_instruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_activity_weather_reportId_slot_key" ON "site_activity_weather"("reportId", "slot");

-- AddForeignKey
ALTER TABLE "site_activity_weather" ADD CONSTRAINT "site_activity_weather_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_material" ADD CONSTRAINT "site_activity_material_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_safety" ADD CONSTRAINT "site_activity_safety_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_activity_instruction" ADD CONSTRAINT "site_activity_instruction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "site_activity_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
