"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const prisma_1 = require("../config/prisma");
/** Relation shape used by the "detail drawer" endpoints (adjust/transfer/batch/serial/attachment)
 * that operate on an itemId param and must verify organization ownership via project.organization. */
const OWNED_ITEM_INCLUDE = {
    project: { include: { organization: true } },
    warehouse: true,
    vendor: true,
    item: true,
};
/** Same as above, plus updatedBy — used where the caller also (re)assigns updatedBy. */
const ITEM_WITH_ALL_RELATIONS_INCLUDE = {
    project: { include: { organization: true } },
    warehouse: true,
    vendor: true,
    item: true,
    updatedBy: true,
};
/** Relation shape used by addInventoryItem/receiveFromProcurement's find-existing-row lookup. */
const RESTOCK_ITEM_INCLUDE = {
    item: true,
    warehouse: true,
    vendor: true,
    updatedBy: true,
};
/** Writes an audit-log row for a stock-affecting mutation. Never throws — best-effort. */
async function logTransaction(item, type, quantityChange, resultingQuantity, reason, userId, organizationId) {
    const performedBy = userId ? await prisma_1.prisma.user.findUnique({ where: { id: userId } }) : null;
    await prisma_1.prisma.inventoryTransaction.create({
        data: {
            type,
            quantityChange,
            resultingQuantity,
            inventoryItemId: item.id,
            organizationId,
            ...(reason ? { reason } : {}),
            ...(performedBy ? { performedById: performedBy.id } : {}),
        },
    });
}
/** Inventory tab: stock items scoped to a project. */
class InventoryController {
    /** GET /organization/inventory — aggregated across every project in the organization, for the sidebar Inventory page. */
    static getOrganizationInventory = async (req, res) => {
        try {
            const items = await prisma_1.prisma.inventoryItem.findMany({
                where: { project: { organizationId: req.organization.id } },
                include: { updatedBy: true, project: true, warehouse: true, vendor: true, item: true },
                orderBy: { createdAt: "desc" },
            });
            const result = items.map((item) => ({
                id: item.id,
                itemName: item.itemName,
                item: item.item ? { id: item.item.id, name: item.item.name, code: item.item.code } : null,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit,
                status: item.status,
                lastRestockedDate: item.lastRestockedDate,
                notes: item.notes,
                sku: item.sku,
                warehouse: item.warehouse ? { id: item.warehouse.id, name: item.warehouse.name } : null,
                reservedQuantity: item.reservedQuantity,
                incomingQuantity: item.incomingQuantity,
                averageCost: item.averageCost,
                supplier: item.supplier,
                vendor: item.vendor ? { id: item.vendor.id, name: item.vendor.name } : null,
                imageUrl: item.imageUrl,
                warrantyExpiryDate: item.warrantyExpiryDate,
                updatedBy: item.updatedBy,
                createdAt: item.createdAt,
                projectId: item.project.id,
                projectName: item.project.name,
            }));
            return res.status(200).json({ items: result });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /projects/:projectId/inventory — flat list for the Inventory tab. Open to any organization member. */
    static getInventoryItems = async (req, res) => {
        const { projectId } = req.params;
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const items = await prisma_1.prisma.inventoryItem.findMany({
                where: { projectId: project.id },
                include: { updatedBy: true, warehouse: true, vendor: true, item: true },
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json({ items });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/:projectId/inventory — add a stock item. Admin-gated (see routes.ts). */
    static addInventoryItem = async (req, res) => {
        const { projectId } = req.params;
        const { itemName, itemId, category, quantity, unit, status, lastRestockedDate, notes, sku, warehouseId, reservedQuantity, incomingQuantity, averageCost, supplier, vendorId, imageUrl, warrantyExpiryDate, } = req.body;
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            // Prefer the catalog reference when given, so name/SKU stay consistent
            // with the shared catalog instead of trusting a freehand itemName/sku —
            // itemName is still required on the DTO for legacy callers (e.g. CSV
            // import) that don't go through the catalog.
            let catalogItem = null;
            if (itemId) {
                catalogItem = await prisma_1.prisma.catalogItem.findFirst({
                    where: { id: itemId, organizationId: req.organization.id },
                });
                if (!catalogItem) {
                    return res.status(400).json({ message: "Selected item not found" });
                }
            }
            const trimmedName = catalogItem
                ? catalogItem.name
                : typeof itemName === "string"
                    ? itemName.trim()
                    : "";
            if (!trimmedName) {
                return res.status(400).json({ message: "Item name is required" });
            }
            const updatedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const warehouse = warehouseId
                ? await prisma_1.prisma.warehouse.findFirst({
                    where: { id: warehouseId, organizationId: req.organization.id },
                })
                : null;
            const vendor = vendorId
                ? await prisma_1.prisma.vendor.findFirst({
                    where: { id: vendorId, organizationId: req.organization.id },
                })
                : null;
            const finalQuantity = quantity && quantity > 0 ? Math.round(quantity) : 0;
            // Adding stock for an item already tracked in this project is a
            // restock, not a new line item — match on the shared catalog
            // reference (or, for legacy free-text rows with no catalog link, the
            // exact item name) and fold the quantity into the existing row
            // instead of inserting a duplicate. This is what keeps the Inventory
            // table to one row per item; the "Inventory Transactions" section in
            // the item drawer (InventoryTransaction rows, via logTransaction)
            // already provides the per-addition date/quantity history.
            const existingItem = await prisma_1.prisma.inventoryItem.findFirst({
                where: catalogItem
                    ? { projectId: project.id, itemId: catalogItem.id }
                    : { projectId: project.id, itemName: trimmedName, itemId: null },
                include: RESTOCK_ITEM_INCLUDE,
            });
            if (existingItem) {
                const previousQuantity = existingItem.quantity;
                const updateData = {
                    quantity: previousQuantity + finalQuantity,
                };
                if (category)
                    updateData.category = category;
                if (unit)
                    updateData.unit = unit;
                if (status)
                    updateData.status = status;
                if (lastRestockedDate)
                    updateData.lastRestockedDate = new Date(lastRestockedDate);
                if (notes)
                    updateData.notes = notes;
                if (warehouse)
                    updateData.warehouseId = warehouse.id;
                if (reservedQuantity !== undefined)
                    updateData.reservedQuantity = Math.max(0, Math.round(reservedQuantity));
                if (incomingQuantity !== undefined)
                    updateData.incomingQuantity = Math.max(0, Math.round(incomingQuantity));
                if (averageCost !== undefined)
                    updateData.averageCost = averageCost;
                if (supplier)
                    updateData.supplier = supplier;
                if (vendor)
                    updateData.vendorId = vendor.id;
                if (imageUrl)
                    updateData.imageUrl = imageUrl;
                if (warrantyExpiryDate)
                    updateData.warrantyExpiryDate = new Date(warrantyExpiryDate);
                if (updatedBy)
                    updateData.updatedById = updatedBy.id;
                const updatedItem = await prisma_1.prisma.inventoryItem.update({
                    where: { id: existingItem.id },
                    data: updateData,
                    include: RESTOCK_ITEM_INCLUDE,
                });
                if (finalQuantity > 0) {
                    await logTransaction(updatedItem, "receipt", finalQuantity, updatedItem.quantity, "Additional stock received", req.user.id, req.organization.id);
                }
                return res.status(200).json({ message: "Stock added to existing item", item: updatedItem });
            }
            const createData = {
                itemName: trimmedName,
                quantity: finalQuantity,
                projectId: project.id,
                organizationId: req.organization.id,
                ...(category ? { category } : {}),
                ...(unit ? { unit } : {}),
                ...(status ? { status } : {}),
                ...(lastRestockedDate ? { lastRestockedDate: new Date(lastRestockedDate) } : {}),
                ...(notes ? { notes } : {}),
                ...(catalogItem
                    ? { itemId: catalogItem.id, ...(catalogItem.code !== undefined ? { sku: catalogItem.code } : {}) }
                    : sku
                        ? { sku }
                        : {}),
                ...(warehouse ? { warehouseId: warehouse.id } : {}),
                ...(reservedQuantity !== undefined ? { reservedQuantity: Math.max(0, Math.round(reservedQuantity)) } : {}),
                ...(incomingQuantity !== undefined ? { incomingQuantity: Math.max(0, Math.round(incomingQuantity)) } : {}),
                ...(averageCost !== undefined ? { averageCost } : {}),
                ...(supplier ? { supplier } : {}),
                ...(vendor ? { vendorId: vendor.id } : {}),
                ...(imageUrl ? { imageUrl } : {}),
                ...(warrantyExpiryDate ? { warrantyExpiryDate: new Date(warrantyExpiryDate) } : {}),
                ...(updatedBy ? { updatedById: updatedBy.id } : {}),
            };
            const item = await prisma_1.prisma.inventoryItem.create({
                data: createData,
                include: RESTOCK_ITEM_INCLUDE,
            });
            if (finalQuantity > 0) {
                await logTransaction(item, "receipt", finalQuantity, finalQuantity, "Initial stock", req.user.id, req.organization.id);
            }
            return res.status(201).json({ message: "Inventory item added", item });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /**
     * Called from ProcurementController when a purchase request is marked
     * "delivered" — folds the delivered quantity into the project's Inventory
     * using the same find-or-create-merge logic as addInventoryItem (dedup by
     * catalog item, or by exact name for legacy free-text rows), so a
     * delivered PO shows up as stock automatically instead of requiring a
     * separate manual Inventory entry. Never throws — a failure here shouldn't
     * block the procurement status update itself.
     */
    static async receiveFromProcurement(params) {
        const { project, organization, catalogItem, itemName, quantity, unit, unitCost, vendor, poNumber, userId } = params;
        const finalQuantity = quantity && quantity > 0 ? Math.round(quantity) : 0;
        if (finalQuantity <= 0)
            return;
        try {
            const updatedBy = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
            const reason = poNumber ? `Received from procurement ${poNumber}` : "Received from procurement";
            const existingItem = await prisma_1.prisma.inventoryItem.findFirst({
                where: catalogItem
                    ? { projectId: project.id, itemId: catalogItem.id }
                    : { projectId: project.id, itemName, itemId: null },
                include: RESTOCK_ITEM_INCLUDE,
            });
            if (existingItem) {
                const updateData = {
                    quantity: existingItem.quantity + finalQuantity,
                };
                if (unit)
                    updateData.unit = unit;
                if (unitCost !== undefined && unitCost !== null)
                    updateData.averageCost = unitCost;
                if (vendor)
                    updateData.vendorId = vendor.id;
                if (updatedBy)
                    updateData.updatedById = updatedBy.id;
                const updatedItem = await prisma_1.prisma.inventoryItem.update({
                    where: { id: existingItem.id },
                    data: updateData,
                    include: RESTOCK_ITEM_INCLUDE,
                });
                await logTransaction(updatedItem, "receipt", finalQuantity, updatedItem.quantity, reason, userId, organization.id);
                return updatedItem;
            }
            const createData = {
                itemName,
                quantity: finalQuantity,
                projectId: project.id,
                organizationId: organization.id,
                ...(unit ? { unit } : {}),
                ...(catalogItem
                    ? { itemId: catalogItem.id, ...(catalogItem.code !== undefined ? { sku: catalogItem.code } : {}) }
                    : {}),
                ...(unitCost !== undefined && unitCost !== null ? { averageCost: unitCost } : {}),
                ...(vendor ? { vendorId: vendor.id } : {}),
                ...(updatedBy ? { updatedById: updatedBy.id } : {}),
            };
            const item = await prisma_1.prisma.inventoryItem.create({
                data: createData,
                include: RESTOCK_ITEM_INCLUDE,
            });
            await logTransaction(item, "receipt", finalQuantity, finalQuantity, reason, userId, organization.id);
            return item;
        }
        catch (error) {
            console.error("Failed to receive procurement item into inventory:", error);
            return undefined;
        }
    }
    /** PUT /projects/inventory/:itemId — update fields and/or status. Admin-gated. */
    static updateInventoryItem = async (req, res) => {
        const { itemId } = req.params;
        const { itemName, itemId: catalogItemId, category, quantity, unit, status, lastRestockedDate, notes, sku, warehouseId, reservedQuantity, incomingQuantity, averageCost, supplier, vendorId, imageUrl, warrantyExpiryDate, } = req.body;
        try {
            const item = await prisma_1.prisma.inventoryItem.findUnique({
                where: { id: parseInt(itemId) },
                include: OWNED_ITEM_INCLUDE,
            });
            if (!item || item.project?.organizationId !== req.organization.id) {
                return res.status(404).json({ message: "Inventory item not found" });
            }
            const previousQuantity = item.quantity;
            const data = {};
            if (itemName !== undefined) {
                const trimmedName = itemName.trim();
                if (!trimmedName) {
                    return res.status(400).json({ message: "Item name is required" });
                }
                data.itemName = trimmedName;
            }
            if (category !== undefined)
                data.category = category;
            if (quantity !== undefined)
                data.quantity = Math.max(0, Math.round(quantity));
            if (unit !== undefined)
                data.unit = unit;
            if (status !== undefined)
                data.status = status;
            if (lastRestockedDate !== undefined) {
                // null (not undefined) so Prisma actually issues SET "lastRestockedDate" = NULL
                // instead of silently excluding the column from the UPDATE.
                data.lastRestockedDate = lastRestockedDate ? new Date(lastRestockedDate) : null;
            }
            if (notes !== undefined)
                data.notes = notes;
            if (sku !== undefined)
                data.sku = sku;
            if (warehouseId !== undefined) {
                if (warehouseId === null) {
                    data.warehouseId = null;
                }
                else {
                    const warehouse = await prisma_1.prisma.warehouse.findFirst({
                        where: { id: warehouseId, organizationId: req.organization.id },
                    });
                    if (warehouse)
                        data.warehouseId = warehouse.id;
                }
            }
            if (reservedQuantity !== undefined)
                data.reservedQuantity = Math.max(0, Math.round(reservedQuantity));
            if (incomingQuantity !== undefined)
                data.incomingQuantity = Math.max(0, Math.round(incomingQuantity));
            if (averageCost !== undefined) {
                data.averageCost = averageCost === null ? null : averageCost;
            }
            if (supplier !== undefined)
                data.supplier = supplier;
            if (vendorId !== undefined) {
                if (vendorId === null) {
                    data.vendorId = null;
                }
                else {
                    const vendor = await prisma_1.prisma.vendor.findFirst({
                        where: { id: vendorId, organizationId: req.organization.id },
                    });
                    if (vendor)
                        data.vendorId = vendor.id;
                }
            }
            if (imageUrl !== undefined)
                data.imageUrl = imageUrl;
            if (warrantyExpiryDate !== undefined) {
                data.warrantyExpiryDate = warrantyExpiryDate ? new Date(warrantyExpiryDate) : null;
            }
            // Applied last so a catalog reference wins over any conflicting
            // freeform itemName/sku sent in the same request — the catalog is the
            // source of truth once an item is linked to it.
            if (catalogItemId !== undefined) {
                if (catalogItemId === null) {
                    data.itemId = null;
                }
                else {
                    const catalogItem = await prisma_1.prisma.catalogItem.findFirst({
                        where: { id: catalogItemId, organizationId: req.organization.id },
                    });
                    if (!catalogItem) {
                        return res.status(400).json({ message: "Selected item not found" });
                    }
                    data.itemId = catalogItem.id;
                    data.itemName = catalogItem.name;
                    if (catalogItem.code !== undefined) {
                        data.sku = catalogItem.code;
                    }
                }
            }
            const updatedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (updatedBy)
                data.updatedById = updatedBy.id;
            const updatedItem = await prisma_1.prisma.inventoryItem.update({
                where: { id: item.id },
                data,
                include: ITEM_WITH_ALL_RELATIONS_INCLUDE,
            });
            if (quantity !== undefined && updatedItem.quantity !== previousQuantity) {
                await logTransaction(updatedItem, "adjustment", updatedItem.quantity - previousQuantity, updatedItem.quantity, "Manual edit", req.user.id, req.organization.id);
            }
            return res.status(200).json({ message: "Inventory item updated", item: updatedItem });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /projects/inventory/:itemId — admin-gated. */
    static deleteInventoryItem = async (req, res) => {
        const { itemId } = req.params;
        try {
            const item = await prisma_1.prisma.inventoryItem.findUnique({
                where: { id: parseInt(itemId) },
                include: { project: { include: { organization: true } } },
            });
            if (!item || item.project?.organizationId !== req.organization.id) {
                return res.status(404).json({ message: "Inventory item not found" });
            }
            await prisma_1.prisma.inventoryItem.delete({ where: { id: item.id } });
            return res.status(200).json({ message: "Inventory item deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** Loads an item scoped to the caller's organization, or null. Shared by all the detail-drawer endpoints below. */
    static async loadOwnedItem(itemId, organizationId) {
        const item = await prisma_1.prisma.inventoryItem.findUnique({
            where: { id: parseInt(itemId) },
            include: OWNED_ITEM_INCLUDE,
        });
        if (!item || item.project?.organizationId !== organizationId)
            return null;
        return item;
    }
    /** POST /projects/inventory/:itemId/adjust — manual stock adjustment (writes a transaction). Admin-gated. */
    static adjustStock = async (req, res) => {
        const { itemId } = req.params;
        const { delta, reason } = req.body;
        if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) {
            return res.status(400).json({ message: "A non-zero numeric delta is required" });
        }
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const previousQuantity = item.quantity;
            const newQuantity = Math.max(0, Math.round(previousQuantity + delta));
            const updatedItem = await prisma_1.prisma.inventoryItem.update({
                where: { id: item.id },
                data: { quantity: newQuantity },
                include: OWNED_ITEM_INCLUDE,
            });
            await logTransaction(updatedItem, "adjustment", updatedItem.quantity - previousQuantity, updatedItem.quantity, reason, req.user.id, req.organization.id);
            return res.status(200).json({ message: "Stock adjusted", item: updatedItem });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/inventory/:itemId/transfers — request a warehouse-to-warehouse transfer. Admin-gated. */
    static createTransfer = async (req, res) => {
        const { itemId } = req.params;
        const { fromWarehouseId, toWarehouseId, quantity, notes } = req.body;
        if (!toWarehouseId || !quantity || quantity <= 0) {
            return res.status(400).json({ message: "toWarehouseId and a positive quantity are required" });
        }
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const toWarehouse = await prisma_1.prisma.warehouse.findFirst({
                where: { id: toWarehouseId, organizationId: req.organization.id },
            });
            if (!toWarehouse)
                return res.status(404).json({ message: "Destination warehouse not found" });
            const fromWarehouse = fromWarehouseId
                ? await prisma_1.prisma.warehouse.findFirst({ where: { id: fromWarehouseId, organizationId: req.organization.id } })
                : null;
            const requestedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const transfer = await prisma_1.prisma.stockTransfer.create({
                data: {
                    inventoryItemId: item.id,
                    toWarehouseId: toWarehouse.id,
                    quantity: Math.round(quantity),
                    ...(fromWarehouse ? { fromWarehouseId: fromWarehouse.id } : {}),
                    ...(notes ? { notes } : {}),
                    ...(requestedBy ? { requestedById: requestedBy.id } : {}),
                },
                include: { inventoryItem: true, toWarehouse: true, fromWarehouse: true, requestedBy: true },
            });
            return res.status(201).json({ message: "Transfer created", transfer });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** PUT /projects/inventory/:itemId/transfers/:transferId — advance a transfer's status. Admin-gated. */
    static updateTransferStatus = async (req, res) => {
        const { itemId, transferId } = req.params;
        const { status } = req.body;
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const transfer = await prisma_1.prisma.stockTransfer.findFirst({
                where: { id: parseInt(transferId), inventoryItemId: item.id },
                include: { fromWarehouse: true, toWarehouse: true },
            });
            if (!transfer)
                return res.status(404).json({ message: "Transfer not found" });
            const wasCompleted = transfer.status === "completed";
            const transferData = { status };
            if (status === "completed" && !wasCompleted) {
                transferData.completedAt = new Date();
                // Single-primary-warehouse model: completing a transfer relocates the
                // item's primary location; total on-hand quantity is unaffected, so
                // both audit rows below net to zero but keep the move visible in history.
                const updatedItem = await prisma_1.prisma.inventoryItem.update({
                    where: { id: item.id },
                    data: { warehouseId: transfer.toWarehouseId },
                    include: OWNED_ITEM_INCLUDE,
                });
                await logTransaction(updatedItem, "transfer_out", -transfer.quantity, updatedItem.quantity, `Transfer #${transfer.id} out`, req.user.id, req.organization.id);
                await logTransaction(updatedItem, "transfer_in", transfer.quantity, updatedItem.quantity, `Transfer #${transfer.id} in`, req.user.id, req.organization.id);
            }
            const updatedTransfer = await prisma_1.prisma.stockTransfer.update({
                where: { id: transfer.id },
                data: transferData,
                include: { fromWarehouse: true, toWarehouse: true },
            });
            return res.status(200).json({ message: "Transfer updated", transfer: updatedTransfer });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/inventory/:itemId/batches — add a batch/lot. Admin-gated. */
    static addBatch = async (req, res) => {
        const { itemId } = req.params;
        const { batchNumber, quantity, manufactureDate, expiryDate } = req.body;
        if (!batchNumber || !batchNumber.trim()) {
            return res.status(400).json({ message: "Batch number is required" });
        }
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const batch = await prisma_1.prisma.inventoryBatch.create({
                data: {
                    batchNumber: batchNumber.trim(),
                    quantity: quantity && quantity > 0 ? Math.round(quantity) : 0,
                    inventoryItemId: item.id,
                    ...(manufactureDate ? { manufactureDate: new Date(manufactureDate) } : {}),
                    ...(expiryDate ? { expiryDate: new Date(expiryDate) } : {}),
                },
            });
            return res.status(201).json({ message: "Batch added", batch });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /projects/inventory/:itemId/batches/:batchId — admin-gated. */
    static deleteBatch = async (req, res) => {
        const { itemId, batchId } = req.params;
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const batch = await prisma_1.prisma.inventoryBatch.findFirst({
                where: { id: parseInt(batchId), inventoryItemId: item.id },
            });
            if (!batch)
                return res.status(404).json({ message: "Batch not found" });
            await prisma_1.prisma.inventoryBatch.delete({ where: { id: batch.id } });
            return res.status(200).json({ message: "Batch deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/inventory/:itemId/serials — add a serial number. Admin-gated. */
    static addSerial = async (req, res) => {
        const { itemId } = req.params;
        const { serialNumber, status, warrantyExpiryDate, notes } = req.body;
        if (!serialNumber || !serialNumber.trim()) {
            return res.status(400).json({ message: "Serial number is required" });
        }
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const serial = await prisma_1.prisma.inventorySerial.create({
                data: {
                    serialNumber: serialNumber.trim(),
                    inventoryItemId: item.id,
                    ...(status ? { status } : {}),
                    ...(warrantyExpiryDate ? { warrantyExpiryDate: new Date(warrantyExpiryDate) } : {}),
                    ...(notes ? { notes } : {}),
                },
            });
            return res.status(201).json({ message: "Serial added", serial });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /projects/inventory/:itemId/serials/:serialId — admin-gated. */
    static deleteSerial = async (req, res) => {
        const { itemId, serialId } = req.params;
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const serial = await prisma_1.prisma.inventorySerial.findFirst({
                where: { id: parseInt(serialId), inventoryItemId: item.id },
            });
            if (!serial)
                return res.status(404).json({ message: "Serial not found" });
            await prisma_1.prisma.inventorySerial.delete({ where: { id: serial.id } });
            return res.status(200).json({ message: "Serial deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/inventory/:itemId/attachments — upload a document. Admin-gated. Expects multer single("file"). */
    static addAttachment = async (req, res) => {
        const { itemId } = req.params;
        const file = req.file;
        if (!file)
            return res.status(400).json({ message: "A file is required" });
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const uploadedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const attachment = await prisma_1.prisma.inventoryAttachment.create({
                data: {
                    fileName: file.originalname,
                    filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
                    inventoryItemId: item.id,
                    ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
                },
            });
            return res.status(201).json({ message: "Attachment uploaded", attachment });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /projects/inventory/:itemId/attachments/:attachmentId — admin-gated. */
    static deleteAttachment = async (req, res) => {
        const { itemId, attachmentId } = req.params;
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const attachment = await prisma_1.prisma.inventoryAttachment.findFirst({
                where: { id: parseInt(attachmentId), inventoryItemId: item.id },
            });
            if (!attachment)
                return res.status(404).json({ message: "Attachment not found" });
            await prisma_1.prisma.inventoryAttachment.delete({ where: { id: attachment.id } });
            return res.status(200).json({ message: "Attachment deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /**
     * GET /projects/inventory/:itemId/detail — everything the drawer needs in one
     * round-trip: batches, serials, recent transactions, transfers, attachments,
     * purchase history (matching ProcurementItem rows) and project allocation
     * (other InventoryItem rows with the same name across the organization).
     */
    static getInventoryItemDetail = async (req, res) => {
        const { itemId } = req.params;
        try {
            const item = await InventoryController.loadOwnedItem(itemId, req.organization.id);
            if (!item)
                return res.status(404).json({ message: "Inventory item not found" });
            const [batches, serials, transactions, transfers, attachments, purchaseHistory, projectAllocation] = await Promise.all([
                prisma_1.prisma.inventoryBatch.findMany({
                    where: { inventoryItemId: item.id },
                    orderBy: { createdAt: "desc" },
                }),
                prisma_1.prisma.inventorySerial.findMany({
                    where: { inventoryItemId: item.id },
                    orderBy: { createdAt: "desc" },
                }),
                prisma_1.prisma.inventoryTransaction.findMany({
                    where: { inventoryItemId: item.id },
                    include: { performedBy: true },
                    orderBy: { createdAt: "desc" },
                    take: 50,
                }),
                prisma_1.prisma.stockTransfer.findMany({
                    where: { inventoryItemId: item.id },
                    include: { fromWarehouse: true, toWarehouse: true, requestedBy: true },
                    orderBy: { createdAt: "desc" },
                }),
                prisma_1.prisma.inventoryAttachment.findMany({
                    where: { inventoryItemId: item.id },
                    include: { uploadedBy: true },
                    orderBy: { createdAt: "desc" },
                }),
                // Procurement pipeline v2: purchase history is now PurchaseOrderItem rows with the
                // same item name (analogous to the old ProcurementItem-by-name lookup this replaced).
                prisma_1.prisma.purchaseOrderItem.findMany({
                    where: { itemName: item.itemName, purchaseOrder: { organizationId: req.organization.id } },
                    include: { purchaseOrder: { include: { vendor: true, project: true } } },
                    orderBy: { createdAt: "desc" },
                    take: 20,
                }),
                prisma_1.prisma.inventoryItem.findMany({
                    where: { itemName: item.itemName, project: { organizationId: req.organization.id } },
                    include: { project: true },
                    orderBy: { createdAt: "desc" },
                }),
            ]);
            return res.status(200).json({
                item,
                batches,
                serials,
                transactions,
                transfers,
                attachments,
                purchaseHistory,
                projectAllocation: projectAllocation.filter((row) => row.id !== item.id),
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /organization/warehouses — list warehouses for pickers/filters. */
    static getOrganizationWarehouses = async (req, res) => {
        try {
            const warehouses = await prisma_1.prisma.warehouse.findMany({
                where: { organizationId: req.organization.id },
                orderBy: { name: "asc" },
            });
            return res.status(200).json({ warehouses });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /organization/inventory/transfers — pending/in-transit transfers across the organization, for the KPI strip. */
    static getOrganizationPendingTransfers = async (req, res) => {
        try {
            const transfers = await prisma_1.prisma.stockTransfer.findMany({
                where: {
                    inventoryItem: { project: { organizationId: req.organization.id } },
                    status: { in: ["pending", "in_transit"] },
                },
                include: {
                    inventoryItem: { include: { project: true } },
                    fromWarehouse: true,
                    toWarehouse: true,
                },
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json({ transfers });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /organization/inventory/transactions — recent audit-log entries across the organization, for the sidebar widget. */
    static getOrganizationInventoryTransactions = async (req, res) => {
        try {
            const transactions = await prisma_1.prisma.inventoryTransaction.findMany({
                where: { organizationId: req.organization.id },
                include: { performedBy: true, inventoryItem: true },
                orderBy: { createdAt: "desc" },
                take: 20,
            });
            return res.status(200).json({ transactions });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /organization/warehouses — create a warehouse. Admin-gated. */
    static createWarehouse = async (req, res) => {
        const { name, code, location, capacity } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Warehouse name is required" });
        }
        try {
            const warehouse = await prisma_1.prisma.warehouse.create({
                data: {
                    name: name.trim(),
                    capacity: capacity && capacity > 0 ? Math.round(capacity) : 0,
                    organizationId: req.organization.id,
                    ...(code ? { code } : {}),
                    ...(location ? { location } : {}),
                },
            });
            return res.status(201).json({ message: "Warehouse created", warehouse });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /organization/vendors — list vendors for pickers/filters. */
    static getOrganizationVendors = async (req, res) => {
        try {
            const vendors = await prisma_1.prisma.vendor.findMany({
                where: { organizationId: req.organization.id },
                orderBy: { name: "asc" },
            });
            return res.status(200).json({ vendors });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /organization/vendors — create a vendor. Admin-gated. */
    static createVendor = async (req, res) => {
        const { name, code, location, contact, contractExpiryDate, contactPerson, address, email } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Vendor name is required" });
        }
        try {
            const vendor = await prisma_1.prisma.vendor.create({
                data: {
                    name: name.trim(),
                    organizationId: req.organization.id,
                    ...(code ? { code } : {}),
                    ...(location ? { location } : {}),
                    ...(contact ? { contact } : {}),
                    ...(contractExpiryDate ? { contractExpiryDate: new Date(contractExpiryDate) } : {}),
                    ...(contactPerson ? { contactPerson } : {}),
                    ...(address ? { address } : {}),
                    ...(email ? { email } : {}),
                },
            });
            return res.status(201).json({ message: "Vendor created", vendor });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** PUT /organization/vendors/:vendorId — update a vendor. Admin-gated. */
    static updateVendor = async (req, res) => {
        const { vendorId } = req.params;
        const { name, code, location, contact, contractExpiryDate, contactPerson, address, email } = req.body;
        try {
            const vendor = await prisma_1.prisma.vendor.findFirst({
                where: { id: parseInt(vendorId), organizationId: req.organization.id },
            });
            if (!vendor)
                return res.status(404).json({ message: "Vendor not found" });
            const data = {};
            if (name !== undefined) {
                const trimmedName = name.trim();
                if (!trimmedName)
                    return res.status(400).json({ message: "Vendor name is required" });
                data.name = trimmedName;
            }
            if (code !== undefined)
                data.code = code;
            if (location !== undefined)
                data.location = location;
            if (contact !== undefined)
                data.contact = contact;
            if (contractExpiryDate !== undefined) {
                data.contractExpiryDate = contractExpiryDate ? new Date(contractExpiryDate) : null;
            }
            if (contactPerson !== undefined)
                data.contactPerson = contactPerson;
            if (address !== undefined)
                data.address = address;
            if (email !== undefined)
                data.email = email;
            const updatedVendor = await prisma_1.prisma.vendor.update({
                where: { id: vendor.id },
                data,
            });
            return res.status(200).json({ message: "Vendor updated", vendor: updatedVendor });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /organization/vendors/:vendorId — admin-gated. Inventory items referencing this vendor fall back to their legacy free-text supplier field (onDelete: SET NULL on the relation). */
    static deleteVendor = async (req, res) => {
        const { vendorId } = req.params;
        try {
            const vendor = await prisma_1.prisma.vendor.findFirst({
                where: { id: parseInt(vendorId), organizationId: req.organization.id },
            });
            if (!vendor)
                return res.status(404).json({ message: "Vendor not found" });
            await prisma_1.prisma.vendor.delete({ where: { id: vendor.id } });
            return res.status(200).json({ message: "Vendor deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /organization/warehouses/:warehouseId — admin-gated. Inventory items stored at this warehouse are unassigned (onDelete: SET NULL on the relation), not deleted. */
    static deleteWarehouse = async (req, res) => {
        const { warehouseId } = req.params;
        try {
            const warehouse = await prisma_1.prisma.warehouse.findFirst({
                where: { id: parseInt(warehouseId), organizationId: req.organization.id },
            });
            if (!warehouse)
                return res.status(404).json({ message: "Warehouse not found" });
            await prisma_1.prisma.warehouse.delete({ where: { id: warehouse.id } });
            return res.status(200).json({ message: "Warehouse deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.InventoryController = InventoryController;
//# sourceMappingURL=InventoryController.js.map