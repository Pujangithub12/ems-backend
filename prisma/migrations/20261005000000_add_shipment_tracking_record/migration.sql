-- CreateTable
CREATE TABLE "shipment_tracking_record" (
    "id" SERIAL NOT NULL,
    "jobNo" VARCHAR,
    "blNumber" VARCHAR,
    "shipper" VARCHAR,
    "carrierName" VARCHAR,
    "dispatchDate" DATE,
    "eta" DATE,
    "pol" VARCHAR,
    "pod" VARCHAR,
    "containerType" VARCHAR,
    "containerCount" INTEGER,
    "dispatchedFrom" VARCHAR,
    "documentStatus" VARCHAR,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" INTEGER NOT NULL,
    "createdById" INTEGER,

    CONSTRAINT "shipment_tracking_record_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "shipment_tracking_record" ADD CONSTRAINT "shipment_tracking_record_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_tracking_record" ADD CONSTRAINT "shipment_tracking_record_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
