-- DropIndex
DROP INDEX "site_activity_work_type_organizationId_name_key";

-- AlterTable
ALTER TABLE "site_activity_work_type" ADD COLUMN     "kind" VARCHAR NOT NULL DEFAULT 'activity';

-- CreateIndex
CREATE UNIQUE INDEX "site_activity_work_type_organizationId_kind_name_key" ON "site_activity_work_type"("organizationId", "kind", "name");

