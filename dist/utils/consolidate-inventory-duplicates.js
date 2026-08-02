"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consolidateInventoryDuplicates = consolidateInventoryDuplicates;
const prisma_1 = require("../config/prisma");
/**
 * One-time cleanup for InventoryItem rows created before addInventoryItem
 * started folding repeat additions into the existing row (see
 * InventoryController.addInventoryItem) — merges any pre-existing duplicate
 * rows (same project + same catalog item, or same project + same itemName
 * for legacy rows with no catalog link) into a single surviving row, so the
 * Inventory table goes back to one row per item. Idempotent: once no
 * duplicates remain, every group has size 1 and the run is a no-op.
 */
async function consolidateInventoryDuplicates() {
    console.log("Starting inventory duplicate consolidation...");
    const allItems = await prisma_1.prisma.inventoryItem.findMany({
        include: { item: true, project: true, organization: true },
        orderBy: { createdAt: "asc" },
    });
    const groups = new Map();
    for (const item of allItems) {
        const key = item.item
            ? `p${item.project.id}:c${item.item.id}`
            : `p${item.project.id}:n${item.itemName.trim().toLowerCase()}`;
        const group = groups.get(key);
        if (group)
            group.push(item);
        else
            groups.set(key, [item]);
    }
    let mergedGroups = 0;
    let deletedRows = 0;
    for (const group of groups.values()) {
        if (group.length <= 1)
            continue;
        // group is already createdAt ASC (allItems was fetched in that order).
        // Non-null: group.length > 1 is already checked above.
        const survivor = group[0];
        const freshest = group[group.length - 1];
        const duplicates = group.slice(1);
        const duplicateIds = duplicates.map((d) => d.id);
        const originalSurvivorQuantity = survivor.quantity;
        await prisma_1.prisma.$transaction(async (tx) => {
            const totalQuantity = group.reduce((sum, i) => sum + i.quantity, 0);
            const totalReserved = group.reduce((sum, i) => sum + (i.reservedQuantity || 0), 0);
            const totalIncoming = group.reduce((sum, i) => sum + (i.incomingQuantity || 0), 0);
            const costed = group.filter((i) => i.averageCost != null && i.quantity > 0);
            const weightedCost = costed.length > 0
                ? costed.reduce((sum, i) => sum + Number(i.averageCost) * i.quantity, 0) /
                    costed.reduce((sum, i) => sum + i.quantity, 0)
                : survivor.averageCost;
            // Freshest row's own info wins for display fields (most recently
            // entered), quantity fields above are summed across the whole group.
            // Only overwrite when freshest actually has a value, so an unset
            // field on the newest duplicate doesn't blank out the survivor's.
            await tx.inventoryItem.update({
                where: { id: survivor.id },
                data: {
                    quantity: totalQuantity,
                    reservedQuantity: totalReserved,
                    incomingQuantity: totalIncoming,
                    ...(weightedCost != null ? { averageCost: weightedCost } : {}),
                    category: freshest.category,
                    status: freshest.status,
                    ...(freshest.unit !== undefined ? { unit: freshest.unit } : {}),
                    ...(freshest.notes !== undefined ? { notes: freshest.notes } : {}),
                    ...(freshest.sku !== undefined ? { sku: freshest.sku } : {}),
                    ...(freshest.lastRestockedDate !== undefined
                        ? { lastRestockedDate: freshest.lastRestockedDate }
                        : {}),
                    ...(freshest.imageUrl !== undefined ? { imageUrl: freshest.imageUrl } : {}),
                    ...(freshest.warrantyExpiryDate !== undefined
                        ? { warrantyExpiryDate: freshest.warrantyExpiryDate }
                        : {}),
                    ...(freshest.supplier !== undefined ? { supplier: freshest.supplier } : {}),
                    ...(freshest.warehouseId ? { warehouseId: freshest.warehouseId } : {}),
                    ...(freshest.vendorId ? { vendorId: freshest.vendorId } : {}),
                    ...(freshest.updatedById ? { updatedById: freshest.updatedById } : {}),
                },
            });
            // Re-point every child record from the duplicates onto the survivor
            // before deleting them, so batches/serials/transactions/transfers/
            // attachments (the item's history) aren't lost.
            await tx.inventoryBatch.updateMany({
                where: { inventoryItemId: { in: duplicateIds } },
                data: { inventoryItemId: survivor.id },
            });
            await tx.inventorySerial.updateMany({
                where: { inventoryItemId: { in: duplicateIds } },
                data: { inventoryItemId: survivor.id },
            });
            await tx.inventoryAttachment.updateMany({
                where: { inventoryItemId: { in: duplicateIds } },
                data: { inventoryItemId: survivor.id },
            });
            await tx.inventoryTransaction.updateMany({
                where: { inventoryItemId: { in: duplicateIds } },
                data: { inventoryItemId: survivor.id },
            });
            await tx.stockTransfer.updateMany({
                where: { inventoryItemId: { in: duplicateIds } },
                data: { inventoryItemId: survivor.id },
            });
            // A visible record of the merge itself, on top of the real re-pointed
            // history above.
            await tx.inventoryTransaction.create({
                data: {
                    type: "adjustment",
                    quantityChange: totalQuantity - originalSurvivorQuantity,
                    resultingQuantity: totalQuantity,
                    reason: `Merged ${duplicates.length} duplicate entr${duplicates.length === 1 ? "y" : "ies"} of this item into one row`,
                    inventoryItemId: survivor.id,
                    ...(survivor.organization ? { organizationId: survivor.organization.id } : {}),
                },
            });
            await tx.inventoryItem.deleteMany({ where: { id: { in: duplicateIds } } });
        });
        mergedGroups += 1;
        deletedRows += duplicateIds.length;
        console.log(`Merged ${group.length} rows of "${survivor.itemName}" (project ${survivor.project.id}) into item #${survivor.id}`);
    }
    console.log(`Inventory duplicate consolidation complete: ${mergedGroups} item(s) merged, ${deletedRows} duplicate row(s) removed.`);
}
if (require.main === module) {
    consolidateInventoryDuplicates()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error("Consolidation failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=consolidate-inventory-duplicates.js.map