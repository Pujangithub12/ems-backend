-- CreateTable
CREATE TABLE "schedule_task_link" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "predecessorId" INTEGER NOT NULL,
    "successorId" INTEGER NOT NULL,
    "type" VARCHAR NOT NULL DEFAULT 'FS',
    "lagDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_task_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_task_link_projectId_idx" ON "schedule_task_link"("projectId");

-- CreateIndex
CREATE INDEX "schedule_task_link_successorId_idx" ON "schedule_task_link"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_task_link_predecessorId_successorId_key" ON "schedule_task_link"("predecessorId", "successorId");

-- AddForeignKey
ALTER TABLE "schedule_task_link" ADD CONSTRAINT "schedule_task_link_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_task_link" ADD CONSTRAINT "schedule_task_link_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "schedule_task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_task_link" ADD CONSTRAINT "schedule_task_link_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "schedule_task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
