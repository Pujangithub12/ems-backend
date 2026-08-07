-- CreateTable
CREATE TABLE "plant_daily_report" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "steamInitial" DECIMAL,
    "steamFinal" DECIMAL,
    "steamPressure" DECIMAL,
    "steamTemp" DECIMAL,
    "feedwaterTemp" DECIMAL,
    "pelletUsedKg" DECIMAL,
    "pelletsBag" DECIMAL,
    "pelletReceivedKg" DECIMAL,
    "pelletStockOpening" DECIMAL,
    "waterInitial" DECIMAL,
    "waterFinal" DECIMAL,
    "burnerStatus" VARCHAR,
    "burnerHours" DECIMAL,
    "shutdownReason" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plant_daily_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_report_staff" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "plant_report_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plant_daily_report_organizationId_date_key" ON "plant_daily_report"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "plant_report_staff_reportId_userId_key" ON "plant_report_staff"("reportId", "userId");

-- AddForeignKey
ALTER TABLE "plant_daily_report" ADD CONSTRAINT "plant_daily_report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_daily_report" ADD CONSTRAINT "plant_daily_report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_report_staff" ADD CONSTRAINT "plant_report_staff_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "plant_daily_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_report_staff" ADD CONSTRAINT "plant_report_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
