-- CreateTable
CREATE TABLE "daily_generation" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "generation" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,

    CONSTRAINT "daily_generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_generation_projectId_date_key" ON "daily_generation"("projectId", "date");

-- AddForeignKey
ALTER TABLE "daily_generation" ADD CONSTRAINT "daily_generation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_generation" ADD CONSTRAINT "daily_generation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
