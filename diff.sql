-- DropForeignKey
ALTER TABLE "workspace_members_user" DROP CONSTRAINT "FK_ca7791a2d586bc444a938a24b0b";

-- DropForeignKey
ALTER TABLE "workspace_members_user" DROP CONSTRAINT "FK_e2f1c37290df3031f715f1e7b8f";

-- AlterTable
ALTER TABLE "schedule_task" ALTER COLUMN "status" SET DEFAULT 'to_do';

-- AlterTable
ALTER TABLE "sub_task" ADD COLUMN     "estimatedDays" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "task" ALTER COLUMN "status" SET DEFAULT 'to_do';

-- AlterTable
ALTER TABLE "vendor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactPerson" VARCHAR,
ADD COLUMN     "email" VARCHAR;

-- DropTable
DROP TABLE "workspace_members_user";

-- CreateTable
CREATE TABLE "purchase_request" (
    "id" SERIAL NOT NULL,
    "prNumber" VARCHAR,
    "department" VARCHAR,
    "priority" VARCHAR NOT NULL DEFAULT 'medium',
    "reason" TEXT,
    "status" VARCHAR NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" INTEGER,
    "projectId" INTEGER,
    "organizationId" INTEGER,
    "migratedFromProcurementItemId" INTEGER,

    CONSTRAINT "purchase_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_item" (
    "id" SERIAL NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" VARCHAR,
    "estimatedPrice" DECIMAL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseRequestId" INTEGER,
    "itemId" INTEGER,

    CONSTRAINT "purchase_request_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_attachment" (
    "id" SERIAL NOT NULL,
    "fileName" VARCHAR NOT NULL,
    "filePath" VARCHAR NOT NULL,
    "documentType" VARCHAR NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" INTEGER,
    "purchaseRequestId" INTEGER,

    CONSTRAINT "purchase_request_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_status_history" (
    "id" SERIAL NOT NULL,
    "fromStatus" VARCHAR,
    "toStatus" VARCHAR NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" INTEGER,
    "purchaseRequestId" INTEGER,

    CONSTRAINT "purchase_request_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_quote" (
    "id" SERIAL NOT NULL,
    "price" DECIMAL NOT NULL,
    "notes" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseRequestId" INTEGER,
    "vendorId" INTEGER,

    CONSTRAINT "vendor_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" SERIAL NOT NULL,
    "poNumber" VARCHAR,
    "deliveryAddress" TEXT,
    "paymentTerms" VARCHAR,
    "deliveryDate" DATE,
    "incoterms" VARCHAR,
    "taxPercent" DECIMAL,
    "terms" TEXT,
    "shippingTerms" TEXT,
    "deliveryPeriod" TEXT,
    "finalDestination" TEXT,
    "purchaseType" VARCHAR NOT NULL DEFAULT 'local',
    "status" VARCHAR NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseRequestId" INTEGER,
    "vendorId" INTEGER,
    "projectId" INTEGER,
    "organizationId" INTEGER,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_item" (
    "id" SERIAL NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" VARCHAR,
    "unitPrice" DECIMAL,
    "notes" TEXT,
    "hsnCode" VARCHAR,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER,
    "itemId" INTEGER,

    CONSTRAINT "purchase_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_attachment" (
    "id" SERIAL NOT NULL,
    "fileName" VARCHAR NOT NULL,
    "filePath" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" INTEGER,
    "purchaseOrderId" INTEGER,

    CONSTRAINT "purchase_order_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_status_history" (
    "id" SERIAL NOT NULL,
    "fromStatus" VARCHAR,
    "toStatus" VARCHAR NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" INTEGER,
    "purchaseOrderId" INTEGER,

    CONSTRAINT "purchase_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_invoice" (
    "id" SERIAL NOT NULL,
    "piNumber" VARCHAR,
    "piDate" DATE,
    "currency" VARCHAR NOT NULL DEFAULT 'NPR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "paymentTerms" VARCHAR,
    "validityDate" DATE,
    "fileName" VARCHAR,
    "filePath" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'waiting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER,

    CONSTRAINT "proforma_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_invoice_item" (
    "id" SERIAL NOT NULL,
    "itemName" VARCHAR NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" VARCHAR,
    "unitPrice" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proformaInvoiceId" INTEGER,
    "itemId" INTEGER,

    CONSTRAINT "proforma_invoice_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" SERIAL NOT NULL,
    "shipmentNo" VARCHAR,
    "transportMode" VARCHAR NOT NULL DEFAULT 'road',
    "transportCompany" VARCHAR,
    "containerNo" VARCHAR,
    "vehicleNo" VARCHAR,
    "trackingNo" VARCHAR,
    "etd" DATE,
    "eta" DATE,
    "arrivalDate" DATE,
    "status" VARCHAR NOT NULL DEFAULT 'booked',
    "freightCost" DECIMAL,
    "loadingCost" DECIMAL,
    "unloadingCost" DECIMAL,
    "fuelCost" DECIMAL,
    "miscellaneousCost" DECIMAL,
    "localTaxCost" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance" (
    "id" SERIAL NOT NULL,
    "insuranceCompany" VARCHAR,
    "policyNumber" VARCHAR,
    "coverage" DECIMAL,
    "premium" DECIMAL,
    "claimStatus" VARCHAR,
    "attachmentFileName" VARCHAR,
    "attachmentFilePath" VARCHAR,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipmentId" INTEGER,

    CONSTRAINT "insurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs" (
    "id" SERIAL NOT NULL,
    "customDeclarationNumber" VARCHAR,
    "billOfEntry" VARCHAR,
    "hsCode" VARCHAR,
    "clearingAgent" VARCHAR,
    "port" VARCHAR,
    "importDuty" DECIMAL,
    "vat" DECIMAL,
    "excise" DECIMAL,
    "serviceCharge" DECIMAL,
    "documentationCost" DECIMAL,
    "inspectionCost" DECIMAL,
    "warehouseCost" DECIMAL,
    "miscellaneousCost" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipmentId" INTEGER,

    CONSTRAINT "customs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_document" (
    "id" SERIAL NOT NULL,
    "documentType" VARCHAR NOT NULL DEFAULT 'other',
    "fileName" VARCHAR NOT NULL,
    "filePath" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customsId" INTEGER,

    CONSTRAINT "customs_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" SERIAL NOT NULL,
    "grnNumber" VARCHAR,
    "inspectionResult" TEXT,
    "status" VARCHAR NOT NULL DEFAULT 'pending_inspection',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseOrderId" INTEGER,
    "warehouseId" INTEGER,
    "receivedById" INTEGER,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_item" (
    "id" SERIAL NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "goodsReceiptId" INTEGER,
    "purchaseOrderItemId" INTEGER,

    CONSTRAINT "goods_receipt_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_photo" (
    "id" SERIAL NOT NULL,
    "fileName" VARCHAR NOT NULL,
    "filePath" VARCHAR NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "goodsReceiptId" INTEGER,

    CONSTRAINT "goods_receipt_photo_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "purchase_request_migratedFromProcurementItemId_key" ON "purchase_request"("migratedFromProcurementItemId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_purchaseRequestId_key" ON "purchase_order"("purchaseRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_purchaseOrderId_key" ON "shipment"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_shipmentId_key" ON "insurance"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "customs_shipmentId_key" ON "customs"("shipmentId");

-- CreateIndex
CREATE INDEX "schedule_task_link_projectId_idx" ON "schedule_task_link"("projectId");

-- CreateIndex
CREATE INDEX "schedule_task_link_successorId_idx" ON "schedule_task_link"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_task_link_predecessorId_successorId_key" ON "schedule_task_link"("predecessorId", "successorId");

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request_item" ADD CONSTRAINT "purchase_request_item_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request_item" ADD CONSTRAINT "purchase_request_item_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "catalog_item"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request_attachment" ADD CONSTRAINT "purchase_request_attachment_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request_attachment" ADD CONSTRAINT "purchase_request_attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request_status_history" ADD CONSTRAINT "purchase_request_status_history_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_request_status_history" ADD CONSTRAINT "purchase_request_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_quote" ADD CONSTRAINT "vendor_quote_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_quote" ADD CONSTRAINT "vendor_quote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_request"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "catalog_item"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_attachment" ADD CONSTRAINT "purchase_order_attachment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_attachment" ADD CONSTRAINT "purchase_order_attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_status_history" ADD CONSTRAINT "purchase_order_status_history_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_status_history" ADD CONSTRAINT "purchase_order_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proforma_invoice" ADD CONSTRAINT "proforma_invoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proforma_invoice_item" ADD CONSTRAINT "proforma_invoice_item_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoice"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "proforma_invoice_item" ADD CONSTRAINT "proforma_invoice_item_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "catalog_item"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "insurance" ADD CONSTRAINT "insurance_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customs" ADD CONSTRAINT "customs_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customs_document" ADD CONSTRAINT "customs_document_customsId_fkey" FOREIGN KEY ("customsId") REFERENCES "customs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt_item" ADD CONSTRAINT "goods_receipt_item_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipt"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt_item" ADD CONSTRAINT "goods_receipt_item_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_item"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goods_receipt_photo" ADD CONSTRAINT "goods_receipt_photo_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipt"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_task_link" ADD CONSTRAINT "schedule_task_link_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_task_link" ADD CONSTRAINT "schedule_task_link_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "schedule_task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_task_link" ADD CONSTRAINT "schedule_task_link_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "schedule_task"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

