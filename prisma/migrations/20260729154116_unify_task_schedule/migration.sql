-- AlterTable
ALTER TABLE "task" ADD COLUMN     "duration" DOUBLE PRECISION,
ADD COLUMN     "migratedFromScheduleTaskId" INTEGER,
ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentTaskId" INTEGER,
ADD COLUMN     "startDate" DATE;

-- CreateTable
CREATE TABLE "task_link" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "predecessorTaskId" INTEGER NOT NULL,
    "successorTaskId" INTEGER NOT NULL,
    "type" VARCHAR NOT NULL DEFAULT 'FS',
    "lagDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_link_projectId_idx" ON "task_link"("projectId");

-- CreateIndex
CREATE INDEX "task_link_successorTaskId_idx" ON "task_link"("successorTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "task_link_predecessorTaskId_successorTaskId_key" ON "task_link"("predecessorTaskId", "successorTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "task_migratedFromScheduleTaskId_key" ON "task"("migratedFromScheduleTaskId");

-- CreateIndex
CREATE INDEX "task_projectId_parentTaskId_idx" ON "task"("projectId", "parentTaskId");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_link" ADD CONSTRAINT "task_link_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_link" ADD CONSTRAINT "task_link_predecessorTaskId_fkey" FOREIGN KEY ("predecessorTaskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_link" ADD CONSTRAINT "task_link_successorTaskId_fkey" FOREIGN KEY ("successorTaskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

