-- AlterTable
ALTER TABLE "site_activity_equipment" ADD COLUMN     "remarks" VARCHAR;

-- AlterTable
ALTER TABLE "site_activity_manpower" ADD COLUMN     "names" VARCHAR,
ADD COLUMN     "remarks" VARCHAR;

-- AlterTable
ALTER TABLE "site_activity_report" ADD COLUMN     "preparedBy" VARCHAR,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "reportDateBs" VARCHAR,
ADD COLUMN     "signedBy" VARCHAR;
