-- AlterTable
ALTER TABLE "material" ADD COLUMN     "customFields" JSONB;

-- CreateTable
CREATE TABLE "material_field" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "dataType" VARCHAR NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_field_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material_field" ADD CONSTRAINT "material_field_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_field" ADD CONSTRAINT "material_field_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
