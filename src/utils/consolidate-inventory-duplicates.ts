import { AppDataSource } from "../config/data-source";
import { InventoryItem } from "../entities/InventoryItem";
import { InventoryBatch } from "../entities/InventoryBatch";
import { InventorySerial } from "../entities/InventorySerial";
import { InventoryAttachment } from "../entities/InventoryAttachment";
import { InventoryTransaction } from "../entities/InventoryTransaction";
import { StockTransfer } from "../entities/StockTransfer";

/**
 * One-time cleanup for InventoryItem rows created before addInventoryItem
 * started folding repeat additions into the existing row (see
 * InventoryController.addInventoryItem) — merges any pre-existing duplicate
 * rows (same project + same catalog item, or same project + same itemName
 * for legacy rows with no catalog link) into a single surviving row, so the
 * Inventory table goes back to one row per item. Idempotent: once no
 * duplicates remain, every group has size 1 and the run is a no-op.
 */
export async function consolidateInventoryDuplicates() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  console.log("Starting inventory duplicate consolidation...");

  const itemRepository = AppDataSource.getRepository(InventoryItem);
  const allItems = await itemRepository.find({
    relations: ["item", "project", "workspace"],
    order: { createdAt: "ASC" },
  });

  const groups = new Map<string, InventoryItem[]>();
  for (const item of allItems) {
    const key = item.item
      ? `p${item.project.id}:c${item.item.id}`
      : `p${item.project.id}:n${item.itemName.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  let mergedGroups = 0;
  let deletedRows = 0;

  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    // group is already createdAt ASC (allItems was fetched in that order).
    // Non-null: group.length > 1 is already checked above.
    const survivor = group[0]!;
    const freshest = group[group.length - 1]!;
    const duplicates = group.slice(1);
    const duplicateIds = duplicates.map((d) => d.id);

    const originalSurvivorQuantity = survivor.quantity;

    await AppDataSource.transaction(async (manager) => {
      const totalQuantity = group.reduce((sum, i) => sum + i.quantity, 0);
      const totalReserved = group.reduce((sum, i) => sum + (i.reservedQuantity || 0), 0);
      const totalIncoming = group.reduce((sum, i) => sum + (i.incomingQuantity || 0), 0);

      const costed = group.filter((i) => i.averageCost != null && i.quantity > 0);
      const weightedCost =
        costed.length > 0
          ? costed.reduce((sum, i) => sum + Number(i.averageCost) * i.quantity, 0) /
            costed.reduce((sum, i) => sum + i.quantity, 0)
          : survivor.averageCost;

      const survivorRepo = manager.getRepository(InventoryItem);
      survivor.quantity = totalQuantity;
      survivor.reservedQuantity = totalReserved;
      survivor.incomingQuantity = totalIncoming;
      if (weightedCost !== undefined) survivor.averageCost = weightedCost;
      // Freshest row's own info wins for display fields (most recently
      // entered), quantity fields above are summed across the whole group.
      // Only overwrite when freshest actually has a value, so an unset
      // field on the newest duplicate doesn't blank out the survivor's.
      survivor.category = freshest.category;
      survivor.status = freshest.status;
      if (freshest.unit !== undefined) survivor.unit = freshest.unit;
      if (freshest.notes !== undefined) survivor.notes = freshest.notes;
      if (freshest.sku !== undefined) survivor.sku = freshest.sku;
      if (freshest.lastRestockedDate !== undefined) survivor.lastRestockedDate = freshest.lastRestockedDate;
      if (freshest.imageUrl !== undefined) survivor.imageUrl = freshest.imageUrl;
      if (freshest.warrantyExpiryDate !== undefined) survivor.warrantyExpiryDate = freshest.warrantyExpiryDate;
      if (freshest.supplier !== undefined) survivor.supplier = freshest.supplier;
      if (freshest.warehouse) survivor.warehouse = freshest.warehouse;
      if (freshest.vendor) survivor.vendor = freshest.vendor;
      if (freshest.updatedBy) survivor.updatedBy = freshest.updatedBy;
      await survivorRepo.save(survivor);

      // Re-point every child record from the duplicates onto the survivor
      // before deleting them, so batches/serials/transactions/transfers/
      // attachments (the item's history) aren't lost.
      await manager
        .createQueryBuilder()
        .update(InventoryBatch)
        .set({ inventoryItem: { id: survivor.id } as InventoryItem })
        .where("inventoryItemId IN (:...ids)", { ids: duplicateIds })
        .execute();
      await manager
        .createQueryBuilder()
        .update(InventorySerial)
        .set({ inventoryItem: { id: survivor.id } as InventoryItem })
        .where("inventoryItemId IN (:...ids)", { ids: duplicateIds })
        .execute();
      await manager
        .createQueryBuilder()
        .update(InventoryAttachment)
        .set({ inventoryItem: { id: survivor.id } as InventoryItem })
        .where("inventoryItemId IN (:...ids)", { ids: duplicateIds })
        .execute();
      await manager
        .createQueryBuilder()
        .update(InventoryTransaction)
        .set({ inventoryItem: { id: survivor.id } as InventoryItem })
        .where("inventoryItemId IN (:...ids)", { ids: duplicateIds })
        .execute();
      await manager
        .createQueryBuilder()
        .update(StockTransfer)
        .set({ inventoryItem: { id: survivor.id } as InventoryItem })
        .where("inventoryItemId IN (:...ids)", { ids: duplicateIds })
        .execute();

      // A visible record of the merge itself, on top of the real re-pointed
      // history above.
      await manager.getRepository(InventoryTransaction).save(
        manager.getRepository(InventoryTransaction).create({
          type: "adjustment",
          quantityChange: totalQuantity - originalSurvivorQuantity,
          resultingQuantity: totalQuantity,
          reason: `Merged ${duplicates.length} duplicate entr${duplicates.length === 1 ? "y" : "ies"} of this item into one row`,
          inventoryItem: survivor,
          ...(survivor.workspace ? { workspace: survivor.workspace } : {}),
        }),
      );

      await manager.getRepository(InventoryItem).delete(duplicateIds);
    });

    mergedGroups += 1;
    deletedRows += duplicateIds.length;
    console.log(
      `Merged ${group.length} rows of "${survivor.itemName}" (project ${survivor.project.id}) into item #${survivor.id}`,
    );
  }

  console.log(
    `Inventory duplicate consolidation complete: ${mergedGroups} item(s) merged, ${deletedRows} duplicate row(s) removed.`,
  );
}

if (require.main === module) {
  consolidateInventoryDuplicates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Consolidation failed:", error);
      process.exit(1);
    });
}
