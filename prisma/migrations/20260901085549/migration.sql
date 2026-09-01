/*
  Warnings:

  - You are about to drop the column `groupName` on the `plant_report_column` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "plant_report_column" DROP COLUMN "groupName";

-- AlterTable
ALTER TABLE "plant_report_table" ADD COLUMN     "category" VARCHAR;
