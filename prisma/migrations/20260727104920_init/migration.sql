
-- CreateEnum
CREATE TYPE "expense_request_status_enum" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "leave_request_status_enum" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "site_visit_request_status_enum" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "fullName" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "password" VARCHAR NOT NULL,
    "phoneNumber" VARCHAR NOT NULL,
    "address" TEXT NOT NULL,
    "jobPosition" VARCHAR NOT NULL,
    "joinDate" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "homeWorkspaceId" INTEGER,

    CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_ca86b6f9b3be5fe26d307d09b49" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_membership" (
    "id" SERIAL NOT NULL,
    "role" VARCHAR NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,

    CONSTRAINT "PK_6641ba762220c1f1a86c9379e80" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_invite" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR NOT NULL,
    "fullName" VARCHAR NOT NULL,
    "phoneNumber" VARCHAR,
    "address" TEXT,
    "jobPosition" VARCHAR,
    "joinDate" TIMESTAMP(6),
    "role" VARCHAR NOT NULL DEFAULT 'user',
    "workspaceId" INTEGER NOT NULL,
    "token" VARCHAR NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedByUserId" INTEGER,

    CONSTRAINT "PK_731c4e491678e81c9dce6df62cb" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR NOT NULL,
    "description" TEXT NOT NULL,
    "taskId" INTEGER,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_24625a1d6b1b089c8ae206fe467" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement" (
    "id" SERIAL NOT NULL,
    "subject" VARCHAR NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" VARCHAR NOT NULL DEFAULT 'all',
    "targetEmails" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_e0ef0550174fd1099a308fd18a0" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL,
    "date" TIMESTAMP(6) NOT NULL,
    "type" VARCHAR NOT NULL DEFAULT 'holiday',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_176fe24e6eb48c3fef696c7641f" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_item" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "code" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_8996a1f608499554f35bec8601e" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_request" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL DEFAULT 'Expense',
    "amount" DECIMAL NOT NULL,
    "category" VARCHAR NOT NULL DEFAULT 'Other',
    "expenseDate" TIMESTAMP(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "expense_request_status_enum" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "workspaceId" INTEGER,
    "approvedAt" TIMESTAMP(6),

    CONSTRAINT "PK_5c1c32ee5afe4deecf34605433f" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_access" (
    "id" SERIAL NOT NULL,
    "granteeType" VARCHAR NOT NULL,
    "role" VARCHAR,
    "level" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" INTEGER,
    "userId" INTEGER,
    "workspaceId" INTEGER,
    "grantedById" INTEGER,

    CONSTRAINT "PK_4f91934346cfc7e72466111a1bf" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hierarchy_node" (
    "id" SERIAL NOT NULL,
    "label" VARCHAR,
    "userId" INTEGER,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "parentId" INTEGER,
    "workspaceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_e9cd770efa4b70707466c9c0631" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hierarchy_node_secondary_managers_hierarchy_node" (
    "hierarchyNodeId_1" INTEGER NOT NULL,
    "hierarchyNodeId_2" INTEGER NOT NULL,

    CONSTRAINT "PK_704ebfeafc488cc29738437c89f" PRIMARY KEY ("hierarchyNodeId_1","hierarchyNodeId_2")
);

-- CreateTable
CREATE TABLE "inventory_attachment" (
    "id" SERIAL NOT NULL,
    "fileName" VARCHAR NOT NULL,
    "filePath" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" INTEGER,
    "inventoryItemId" INTEGER,

    CONSTRAINT "PK_f821b987181d85e608ed20a2f49" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batch" (
    "id" SERIAL NOT NULL,
    "batchNumber" VARCHAR NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "manufactureDate" DATE,
    "expiryDate" DATE,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inventoryItemId" INTEGER,

    CONSTRAINT "PK_3883f580f1a93c37dba76d42f75" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item" (
    "id" SERIAL NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "category" VARCHAR NOT NULL DEFAULT 'hardware',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR NOT NULL DEFAULT 'in_stock',
    "lastRestockedDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" INTEGER,
    "projectId" INTEGER,
    "workspaceId" INTEGER,
    "unit" VARCHAR,
    "sku" VARCHAR,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "incomingQuantity" INTEGER NOT NULL DEFAULT 0,
    "averageCost" DECIMAL,
    "supplier" VARCHAR,
    "imageUrl" VARCHAR,
    "warrantyExpiryDate" DATE,
    "warehouseId" INTEGER,
    "vendorId" INTEGER,
    "itemId" INTEGER,

    CONSTRAINT "PK_94f5cbcb5f280f2f30bd4a9fd90" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_serial" (
    "id" SERIAL NOT NULL,
    "serialNumber" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'available',
    "warrantyExpiryDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inventoryItemId" INTEGER,

    CONSTRAINT "PK_246d447cfbb975407a4a7d063a2" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transaction" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "resultingQuantity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" INTEGER,
    "inventoryItemId" INTEGER,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_f58bbe29fa78f5b0d59d840d3ce" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" SERIAL NOT NULL,
    "startDate" TIMESTAMP(6) NOT NULL,
    "endDate" TIMESTAMP(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "title" VARCHAR NOT NULL DEFAULT 'Leave Request',
    "status" "leave_request_status_enum" NOT NULL DEFAULT 'pending',
    "workspaceId" INTEGER,
    "approvedAt" TIMESTAMP(6),

    CONSTRAINT "PK_6f6ed3822203a4e10a5753368db" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_performance" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "contractEnergy" DECIMAL,
    "actualGeneration" DECIMAL,
    "incomeReceived" DECIMAL,
    "monthlyExpenditure" DECIMAL,
    "sparePartPurchase" DECIMAL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" INTEGER,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_1f5cbe16154399ef2a09b922eff" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "my_task" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL,
    "description" TEXT,
    "dueDate" DATE,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_5afe456c29a460d171e33a42c22" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_otp" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR NOT NULL,
    "otpCode" VARCHAR NOT NULL,
    "otpExpiresAt" TIMESTAMP(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_74d5385a35ac0c619ca93815200" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_signup" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR NOT NULL,
    "fullName" VARCHAR NOT NULL,
    "password" VARCHAR NOT NULL,
    "otpCode" VARCHAR NOT NULL,
    "otpExpiresAt" TIMESTAMP(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_2d0b029dacccf96f58b57635e6c" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_attachment" (
    "id" SERIAL NOT NULL,
    "fileName" VARCHAR NOT NULL,
    "filePath" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" INTEGER,
    "procurementItemId" INTEGER,

    CONSTRAINT "PK_7daf4aef8c39d882b308044813f" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_item" (
    "id" SERIAL NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimatedCost" DECIMAL,
    "neededByDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" INTEGER,
    "projectId" INTEGER,
    "workspaceId" INTEGER,
    "category" VARCHAR NOT NULL DEFAULT 'hardware',
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "poNumber" VARCHAR,
    "unitCost" DECIMAL,
    "vendorName" VARCHAR,
    "vendorId" INTEGER,
    "itemId" INTEGER,
    "unit" VARCHAR,
    "taxPercent" DECIMAL,
    "discountPercent" DECIMAL,
    "transportCost" DECIMAL,
    "customsCost" DECIMAL,

    CONSTRAINT "PK_58dd75ddfa3fb86cad02d0dea32" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_status_history" (
    "id" SERIAL NOT NULL,
    "fromStatus" VARCHAR,
    "toStatus" VARCHAR NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" INTEGER,
    "procurementItemId" INTEGER,

    CONSTRAINT "PK_86317a5b57832295d35505b6bb9" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATE,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "priority" VARCHAR NOT NULL DEFAULT 'medium',
    "workspaceId" INTEGER,
    "contractDate" DATE,
    "kickoffDate" DATE,
    "estimatedTotalCost" DECIMAL,
    "sellingPrice" DECIMAL,

    CONSTRAINT "PK_4d68b1358bb5b766d3e78f32f57" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assignees_user" (
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "PK_ed4e176ad277bc55fc5bd6ee8dc" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "project_file" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "type" VARCHAR,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" INTEGER,
    "workspaceId" INTEGER,
    "size" INTEGER,
    "path" VARCHAR,
    "version" VARCHAR NOT NULL DEFAULT 'v1.0',
    "uploadedById" INTEGER,

    CONSTRAINT "PK_9e8bbc6ccf0af1d25fbfcddcc80" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_heading" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" INTEGER,
    "parentHeadingId" INTEGER,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_f46f63f859a97751e27a44763a4" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_activity" (
    "id" SERIAL NOT NULL,
    "reportType" VARCHAR NOT NULL,
    "action" VARCHAR NOT NULL,
    "format" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" INTEGER,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_2344b3ce49e1e7833c7eb79a679" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_comment" (
    "id" SERIAL NOT NULL,
    "reportKey" VARCHAR NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_8bb2bc4a3d9c55e031bc5d015c5" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" SERIAL NOT NULL,
    "role" VARCHAR NOT NULL,
    "permissionKey" VARCHAR NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_96c8f1fd25538d3692024115b47" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_task" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "taskId" VARCHAR NOT NULL,
    "taskName" VARCHAR NOT NULL,
    "duration" DOUBLE PRECISION,
    "startDate" DATE,
    "parentId" VARCHAR,
    "predecessorId" VARCHAR,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progress" DOUBLE PRECISION,
    "status" VARCHAR NOT NULL DEFAULT 'pending',

    CONSTRAINT "PK_b184187cc1517c0972cedc4f0b6" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_visit_request" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL DEFAULT 'Site Visit',
    "location" TEXT NOT NULL,
    "visitDate" TIMESTAMP(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "site_visit_request_status_enum" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "workspaceId" INTEGER,
    "approvedAt" TIMESTAMP(6),

    CONSTRAINT "PK_cce8ce3880a7e9f289f04ae084d" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer" (
    "id" SERIAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(6),
    "inventoryItemId" INTEGER,
    "fromWarehouseId" INTEGER,
    "toWarehouseId" INTEGER,
    "requestedById" INTEGER,

    CONSTRAINT "PK_b6165ea3cc5b8062e7eaa1bd44d" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_task" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" INTEGER,
    "parentId" INTEGER,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "history" TEXT,
    "estimatedDays" DOUBLE PRECISION,

    CONSTRAINT "PK_ccb15801cf521e9c45237f484c5" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_task_comment" (
    "id" SERIAL NOT NULL,
    "commentText" TEXT NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER,
    "subTaskId" INTEGER,

    CONSTRAINT "PK_5eb0be21152a27350f1345f910f" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" VARCHAR NOT NULL DEFAULT 'medium',
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "projectId" INTEGER,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "projectHeadingId" INTEGER,
    "files" TEXT,
    "projectName" VARCHAR,
    "createdById" INTEGER,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_fb213f79ee45060ba925ecd576e" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assigned_users_user" (
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "PK_42062be7c481afd8e850318f790" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "task_comment" (
    "id" SERIAL NOT NULL,
    "commentText" TEXT NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER,
    "taskId" INTEGER,

    CONSTRAINT "PK_28da4411b195bfc3c451cfa21ff" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "code" VARCHAR,
    "location" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" INTEGER,
    "contractExpiryDate" DATE,
    "contact" VARCHAR,

    CONSTRAINT "PK_931a23f6231a57604f5a0e32780" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR NOT NULL,
    "code" VARCHAR,
    "location" VARCHAR,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" INTEGER,

    CONSTRAINT "PK_965abf9f99ae8c5983ae74ebde8" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UQ_e12875dfb3b1d92d7d7c5377e22" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_30e8373015a5fd312cc7df08fa5" ON "workspace_membership"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_a428a1440911f6fcb1e860a8ea7" ON "workspace_invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_6b616337ed3b3e6ac360bad6873" ON "workspace_invite"("token");

-- CreateIndex
CREATE INDEX "IDX_77ac9bbf532e1f93926a293af2" ON "hierarchy_node_secondary_managers_hierarchy_node"("hierarchyNodeId_1");

-- CreateIndex
CREATE INDEX "IDX_930c045bf27c4a18a516c21ae9" ON "hierarchy_node_secondary_managers_hierarchy_node"("hierarchyNodeId_2");

-- CreateIndex
CREATE INDEX "IDX_32957898d80b5aca20065bc5d4" ON "monthly_performance"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_f064c1cfedfb0aca0a334aaa967" ON "password_reset_otp"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_535c0b5f98ba76bef7d9abb993b" ON "pending_signup"("email");

-- CreateIndex
CREATE INDEX "IDX_3304439ccc298271dba101e2de" ON "project_assignees_user"("userId");

-- CreateIndex
CREATE INDEX "IDX_de3a9d4c1d1f56d5393775ea4a" ON "project_assignees_user"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_6cf830b2ced18efe154ef790dac" ON "role_permission"("role", "permissionKey");

-- CreateIndex
CREATE INDEX "IDX_4a5d5f0b5eb1490a8e704b0703" ON "schedule_task"("projectId");

-- CreateIndex
CREATE INDEX "IDX_1b1a0ee8b85e614fe21107e0fb" ON "task_assigned_users_user"("taskId");

-- CreateIndex
CREATE INDEX "IDX_876e3650ef1a751f8e9b88d451" ON "task_assigned_users_user"("userId");

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "FK_a78e067bc8a753d4b007bb066ba" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "FK_eb8dad60593b84045c064a40b58" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "FK_26dd80869eb20b6e4733e513d43" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "FK_2743f8990fde12f9586287eb09f" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "FK_3571467bcbe021f66e2bdce96ea" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "FK_6fb21e11779a6aa872a05bf6024" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "FK_59e2a27efcd9e693c42b4940e95" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "catalog_item" ADD CONSTRAINT "FK_805c3806878350a0875a5032d2c" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "expense_request" ADD CONSTRAINT "FK_b6dba08b81543b5e0d7bb823767" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "expense_request" ADD CONSTRAINT "FK_d56d559e2e6a044a392c69e3cce" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access" ADD CONSTRAINT "FK_397ca282d50517817262e3427e6" FOREIGN KEY ("fileId") REFERENCES "project_file"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access" ADD CONSTRAINT "FK_73775d0a6f317e5ca5723fb4d62" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access" ADD CONSTRAINT "FK_d04d9cb64c318657bedb974f466" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access" ADD CONSTRAINT "FK_e11d2995f1fa917c9659747bb22" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hierarchy_node" ADD CONSTRAINT "FK_17b19932d450eeac2967e910e8f" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hierarchy_node" ADD CONSTRAINT "FK_4bc247cadaffdfcbc8838048dae" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hierarchy_node" ADD CONSTRAINT "FK_a6a4af743e28f998a054ffe2f3e" FOREIGN KEY ("parentId") REFERENCES "hierarchy_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hierarchy_node_secondary_managers_hierarchy_node" ADD CONSTRAINT "FK_77ac9bbf532e1f93926a293af2d" FOREIGN KEY ("hierarchyNodeId_1") REFERENCES "hierarchy_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hierarchy_node_secondary_managers_hierarchy_node" ADD CONSTRAINT "FK_930c045bf27c4a18a516c21ae92" FOREIGN KEY ("hierarchyNodeId_2") REFERENCES "hierarchy_node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_attachment" ADD CONSTRAINT "FK_286bc0fe67648ee2952cd593d87" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_attachment" ADD CONSTRAINT "FK_97c340b593107b2a0c2587d6a71" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_batch" ADD CONSTRAINT "FK_b03ffc199d391e66de9e24a0294" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "FK_03560bb52501c9d1316685356c4" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "FK_21f08891af6b1afb9be05f27e3a" FOREIGN KEY ("itemId") REFERENCES "catalog_item"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "FK_8a3f60ea0683e31e4cf2adcca29" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "FK_a3f344bc8d6ba019dd2783bf153" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "FK_acc2d1fe6c461484488183d5cfd" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "FK_dce2540f46fe0da89da3b6b41e4" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_serial" ADD CONSTRAINT "FK_de2a26f7582f6f868f39f727367" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "FK_a1509b27d7c5c1a3011e2a32746" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "FK_b51461369f6854e90adadc63729" FOREIGN KEY ("performedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "FK_c958bda03c283966e8536ac4971" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "FK_ccd082c03225c86d707142fa0dc" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "FK_eb8ac0dcc12a5fa35c97622e153" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_performance" ADD CONSTRAINT "FK_32957898d80b5aca20065bc5d4a" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_performance" ADD CONSTRAINT "FK_67d423e1ac881ab07e270b8eeea" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "my_task" ADD CONSTRAINT "FK_6574ade0f1b9a8a753cd2888849" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "my_task" ADD CONSTRAINT "FK_7ce02825b211eb0f6c8515324e4" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_attachment" ADD CONSTRAINT "FK_608fffab95a5c24356850767cbf" FOREIGN KEY ("procurementItemId") REFERENCES "procurement_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_attachment" ADD CONSTRAINT "FK_d719e36702a5589c5bc8d293468" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "FK_60c7d17e44ffa1db2d1d1a90c08" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "FK_962531b78f7e84a1af9bbed3c5c" FOREIGN KEY ("itemId") REFERENCES "catalog_item"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "FK_af07f3da6e978a7e1fc31c777be" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "FK_c491225838280a413ee9b77c407" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_item" ADD CONSTRAINT "FK_e13850e5ad77122dc1b16cec387" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_status_history" ADD CONSTRAINT "FK_97498b499ec7e4bf975c91b94b4" FOREIGN KEY ("procurementItemId") REFERENCES "procurement_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "procurement_status_history" ADD CONSTRAINT "FK_b6176ad2735eee052610b6e011f" FOREIGN KEY ("changedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "FK_c224ab17df530651e53a398ed92" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_assignees_user" ADD CONSTRAINT "FK_3304439ccc298271dba101e2dec" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignees_user" ADD CONSTRAINT "FK_de3a9d4c1d1f56d5393775ea4a7" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_file" ADD CONSTRAINT "FK_936416a5cdb66338074a4df358a" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_file" ADD CONSTRAINT "FK_e5f485f25c5319568f9461d6a91" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_file" ADD CONSTRAINT "FK_f8b1098952dc5f55a00ee0c1f39" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_heading" ADD CONSTRAINT "FK_0704555110551b4cbdb35db18cc" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_heading" ADD CONSTRAINT "FK_144c305c8afe719a13c4e9e795d" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_heading" ADD CONSTRAINT "FK_f0db1be3fb6c0a04f315d03e6fd" FOREIGN KEY ("parentHeadingId") REFERENCES "project_heading"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "report_activity" ADD CONSTRAINT "FK_074a26e93f27863800f8ce9fa34" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "report_activity" ADD CONSTRAINT "FK_2bf2938d0954fbf9e93c856b42a" FOREIGN KEY ("performedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "report_comment" ADD CONSTRAINT "FK_2097fe196bdac816d6ee6244982" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "report_comment" ADD CONSTRAINT "FK_69a91a4269c5563e91aca8059a6" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_task" ADD CONSTRAINT "FK_4a5d5f0b5eb1490a8e704b07035" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "site_visit_request" ADD CONSTRAINT "FK_3d89c2d659327e1e5d7febea518" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "site_visit_request" ADD CONSTRAINT "FK_6db56a1f2de3cb0f8cce60bfb44" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_transfer" ADD CONSTRAINT "FK_2427b04f943e687abc319906790" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouse"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_transfer" ADD CONSTRAINT "FK_292563b8c9094e289e3b16d7a11" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_transfer" ADD CONSTRAINT "FK_3a6ef9477ac9889e05204b59716" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouse"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_transfer" ADD CONSTRAINT "FK_507b81f163f3419cf1650a7d680" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sub_task" ADD CONSTRAINT "FK_23f418bdf9ed082aeb882131c9d" FOREIGN KEY ("parentId") REFERENCES "sub_task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sub_task" ADD CONSTRAINT "FK_fe51338fd9567d08ae3ab4d5a57" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sub_task_comment" ADD CONSTRAINT "FK_b734e9a861d93c76cb2d764369a" FOREIGN KEY ("subTaskId") REFERENCES "sub_task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sub_task_comment" ADD CONSTRAINT "FK_d4e8b3b5c74b531c5a3ead63560" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "FK_3797a20ef5553ae87af126bc2fe" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "FK_91d76dd2ae372b9b7dfb6bf3fd2" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "FK_b39775a45b2597e07036bf805ef" FOREIGN KEY ("projectHeadingId") REFERENCES "project_heading"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "FK_ce8f24979af169c6cd19cc94e52" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_assigned_users_user" ADD CONSTRAINT "FK_1b1a0ee8b85e614fe21107e0fb8" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assigned_users_user" ADD CONSTRAINT "FK_876e3650ef1a751f8e9b88d4510" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "FK_0fed042ede2365de8b32e105cc6" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_comment" ADD CONSTRAINT "FK_e0e20a1abae5cee7a04a578e0d6" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor" ADD CONSTRAINT "FK_fb0f972eb0ca9c48c227968fd96" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warehouse" ADD CONSTRAINT "FK_5fec6429efa1ed7db3a880f04e2" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

