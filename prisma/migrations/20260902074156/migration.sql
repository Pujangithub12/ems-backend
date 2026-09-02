-- CreateTable
CREATE TABLE "site_activity_work_type" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_activity_work_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_activity_work_type_organizationId_name_key" ON "site_activity_work_type"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "site_activity_work_type" ADD CONSTRAINT "site_activity_work_type_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
