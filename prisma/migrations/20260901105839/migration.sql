/*
  Warnings:

  - You are about to drop the column `quantity` on the `site_activity_material` table. All the data in the column will be lost.
  - You are about to drop the column `receivedAtSite` on the `site_activity_material` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `site_activity_material` table. All the data in the column will be lost.
  - You are about to drop the column `usedAtSite` on the `site_activity_material` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "site_activity_material" DROP COLUMN "quantity",
DROP COLUMN "receivedAtSite",
DROP COLUMN "unit",
DROP COLUMN "usedAtSite",
ADD COLUMN     "receivedQuantity" DOUBLE PRECISION,
ADD COLUMN     "receivedUnit" VARCHAR,
ADD COLUMN     "usedQuantity" DOUBLE PRECISION,
ADD COLUMN     "usedUnit" VARCHAR;
