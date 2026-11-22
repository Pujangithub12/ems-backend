-- CreateTable
CREATE TABLE "attendance_share" (
    "id" SERIAL NOT NULL,
    "ownerWorkspaceId" INTEGER NOT NULL,
    "memberWorkspaceId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_share_memberWorkspaceId_key" ON "attendance_share"("memberWorkspaceId");

-- CreateIndex
CREATE INDEX "attendance_share_ownerWorkspaceId_idx" ON "attendance_share"("ownerWorkspaceId");

-- AddForeignKey
ALTER TABLE "attendance_share" ADD CONSTRAINT "attendance_share_ownerWorkspaceId_fkey" FOREIGN KEY ("ownerWorkspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_share" ADD CONSTRAINT "attendance_share_memberWorkspaceId_fkey" FOREIGN KEY ("memberWorkspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
