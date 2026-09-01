-- Plant Report Phase 2: work-item progress catalog.

-- CreateTable
CREATE TABLE "plant_work_item" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "unit" VARCHAR,
    "targetQuantity" DOUBLE PRECISION NOT NULL,
    "plannedStartDate" DATE,
    "plannedEndDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_work_item_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "daily_report_activity" ADD CONSTRAINT "daily_report_activity_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "plant_work_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_work_item" ADD CONSTRAINT "plant_work_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_work_item" ADD CONSTRAINT "plant_work_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
