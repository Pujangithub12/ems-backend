-- Attendance is taken for hand-entered "attendance employees" instead of rows of the `user` table.
-- Existing marks are kept: every user that already has attendance rows becomes one attendance employee
-- (same name / position), and their rows are re-pointed at it.

-- CreateTable
CREATE TABLE "attendance_employee" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "position" VARCHAR,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUserId" INTEGER,

    CONSTRAINT "attendance_employee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_employee_workspaceId_idx" ON "attendance_employee"("workspaceId");

-- AddForeignKey
ALTER TABLE "attendance_employee" ADD CONSTRAINT "attendance_employee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Carry the existing people over (sourceUserId is a temporary link used only inside this migration)
INSERT INTO "attendance_employee" ("workspaceId", "name", "position", "sourceUserId")
SELECT a."workspaceId", u."fullName", NULLIF(u."jobPosition", ''), a."userId"
FROM (SELECT DISTINCT "workspaceId", "userId" FROM "attendance") a
JOIN "user" u ON u."id" = a."userId"
ORDER BY a."workspaceId", u."fullName";

-- Re-point the marks
ALTER TABLE "attendance" ADD COLUMN "employeeId" INTEGER;

UPDATE "attendance" a
SET "employeeId" = e."id"
FROM "attendance_employee" e
WHERE e."workspaceId" = a."workspaceId" AND e."sourceUserId" = a."userId";

ALTER TABLE "attendance" ALTER COLUMN "employeeId" SET NOT NULL;
ALTER TABLE "attendance_employee" DROP COLUMN "sourceUserId";

-- Swap the old user link for the new employee link
DROP INDEX "attendance_workspaceId_userId_date_key";
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_userId_fkey";
ALTER TABLE "attendance" DROP COLUMN "userId";

-- CreateIndex
CREATE UNIQUE INDEX "attendance_workspaceId_employeeId_date_key" ON "attendance"("workspaceId", "employeeId", "date");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "attendance_employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
