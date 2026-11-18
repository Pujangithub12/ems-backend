/*
  Warnings:

  - You are about to drop the `procurement_access` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "procurement_access" DROP CONSTRAINT "procurement_access_grantedById_fkey";

-- DropForeignKey
ALTER TABLE "procurement_access" DROP CONSTRAINT "procurement_access_proformaInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "procurement_access" DROP CONSTRAINT "procurement_access_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "procurement_access" DROP CONSTRAINT "procurement_access_userId_fkey";

-- DropTable
DROP TABLE "procurement_access";

-- CreateTable
CREATE TABLE "procurement_page_access" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "page" VARCHAR NOT NULL,
    "userId" INTEGER NOT NULL,
    "level" VARCHAR NOT NULL DEFAULT 'view',
    "grantedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_page_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_page_access_userId_idx" ON "procurement_page_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_page_access_workspaceId_page_userId_key" ON "procurement_page_access"("workspaceId", "page", "userId");

-- AddForeignKey
ALTER TABLE "procurement_page_access" ADD CONSTRAINT "procurement_page_access_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_page_access" ADD CONSTRAINT "procurement_page_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_page_access" ADD CONSTRAINT "procurement_page_access_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
