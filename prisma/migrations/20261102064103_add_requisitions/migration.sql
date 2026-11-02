-- CreateTable
CREATE TABLE "requisition" (
    "id" SERIAL NOT NULL,
    "requisitionNo" VARCHAR,
    "requisitionDate" DATE,
    "requestedBy" VARCHAR,
    "priority" VARCHAR,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" INTEGER,
    "createdById" INTEGER,

    CONSTRAINT "requisition_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "requisition" ADD CONSTRAINT "requisition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition" ADD CONSTRAINT "requisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
