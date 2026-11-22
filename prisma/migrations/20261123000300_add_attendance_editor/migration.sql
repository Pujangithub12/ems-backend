-- CreateTable
CREATE TABLE "attendance_editor" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "grantedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_editor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_editor_userId_idx" ON "attendance_editor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_editor_workspaceId_userId_key" ON "attendance_editor"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "attendance_editor" ADD CONSTRAINT "attendance_editor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_editor" ADD CONSTRAINT "attendance_editor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_editor" ADD CONSTRAINT "attendance_editor_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
