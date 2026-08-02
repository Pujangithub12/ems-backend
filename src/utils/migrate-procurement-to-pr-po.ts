import { prisma } from "../config/prisma";

/**
 * One-off, manually-invoked migration (NOT wired into server startup, unlike
 * backfill-organization.ts) that converts every legacy ProcurementItem row
 * into the new PurchaseRequest -> PurchaseOrder -> GoodsReceipt pipeline, so
 * historical purchase requests still show up in the new screens.
 *
 * Status mapping:
 *   pending   -> PurchaseRequest only, status "submitted"
 *   approved  -> PurchaseRequest only, status "approved"
 *   ordered   -> PurchaseRequest "converted_to_po" + PurchaseOrder "sent"
 *   delivered -> PurchaseRequest "converted_to_po" + PurchaseOrder "completed" + GoodsReceipt "accepted"
 *
 * purchaseType always defaults to "local" for migrated rows — there's no
 * historical signal to distinguish local vs international.
 *
 * DATA SAFETY: this only reads procurement_item/procurement_attachment/
 * procurement_status_history (never modifies or deletes them) and only
 * inserts new rows into the new tables. For "delivered" rows it inserts a
 * GoodsReceipt directly with status "accepted" WITHOUT going through
 * GoodsReceiptController's accept flow — that flow increments InventoryItem
 * quantities, and those quantities were already incremented once, live, by
 * the original ProcurementController.updateProcurementItem ->
 * InventoryController.receiveFromProcurement call when the item first
 * shipped. Re-running that increment here would double-count stock.
 *
 * Idempotent via PurchaseRequest.migratedFromProcurementItemId (unique) —
 * rows already migrated are skipped on a re-run. Still a one-off script:
 * invoke manually once after deploying the schema (`npx ts-node
 * src/utils/migrate-procurement-to-pr-po.ts`), not on every boot.
 */
export async function migrateProcurementToPrPo() {
  console.log("Starting procurement -> purchase request/order migration...");

  const legacyItems = await prisma.procurementItem.findMany({
    include: { project: true, vendor: true, item: true },
    orderBy: { createdAt: "asc" },
  });

  let skipped = 0;
  let migratedPrOnly = 0;
  let migratedWithPo = 0;
  let migratedWithGrn = 0;

  for (const legacy of legacyItems) {
    const alreadyMigrated = await prisma.purchaseRequest.findUnique({
      where: { migratedFromProcurementItemId: legacy.id },
    });
    if (alreadyMigrated) {
      skipped += 1;
      continue;
    }
    if (!legacy.project) {
      // Orphaned row with no project — nothing sensible to attach a PR to; skip.
      skipped += 1;
      continue;
    }

    const unitCostNumber = legacy.unitCost != null ? Number(legacy.unitCost) : null;
    const estimatedCostNumber = legacy.estimatedCost != null ? Number(legacy.estimatedCost) : null;
    const estimatedPrice = unitCostNumber ?? estimatedCostNumber;

    const prStatus =
      legacy.status === "delivered" || legacy.status === "ordered" ? "converted_to_po" : legacy.status === "approved" ? "approved" : "submitted";

    await prisma.$transaction(async (tx) => {
      const pr = await tx.purchaseRequest.create({
        data: {
          projectId: legacy.project!.id,
          organizationId: legacy.organizationId,
          status: prStatus,
          reason: legacy.notes,
          requestedById: legacy.requestedById,
          migratedFromProcurementItemId: legacy.id,
          items: {
            create: [
              {
                itemName: legacy.itemName,
                itemId: legacy.itemId,
                quantity: legacy.quantity,
                unit: legacy.unit,
                estimatedPrice,
                notes: legacy.notes,
              },
            ],
          },
        },
        include: { items: true },
      });
      await tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { prNumber: `PR-${String(pr.id).padStart(6, "0")}` },
      });
      await tx.purchaseRequestStatusHistory.create({
        data: {
          toStatus: prStatus,
          purchaseRequestId: pr.id,
          notes: `Migrated from legacy procurement item #${legacy.id}`,
        },
      });

      if (legacy.vendorId && estimatedPrice != null) {
        await tx.vendorQuote.create({
          data: {
            purchaseRequestId: pr.id,
            vendorId: legacy.vendorId,
            price: estimatedPrice * legacy.quantity,
            isSelected: true,
            notes: `Migrated from legacy procurement item #${legacy.id}`,
          },
        });
      }

      if (legacy.status !== "ordered" && legacy.status !== "delivered") {
        migratedPrOnly += 1;
        return;
      }

      const poStatus = legacy.status === "delivered" ? "completed" : "sent";
      const po = await tx.purchaseOrder.create({
        data: {
          purchaseRequestId: pr.id,
          vendorId: legacy.vendorId,
          projectId: legacy.project!.id,
          organizationId: legacy.organizationId,
          purchaseType: "local",
          status: poStatus,
          taxPercent: legacy.taxPercent,
          items: {
            create: [
              {
                itemName: legacy.itemName,
                itemId: legacy.itemId,
                quantity: legacy.quantity,
                unit: legacy.unit,
                unitPrice: estimatedPrice,
                notes: legacy.notes,
              },
            ],
          },
        },
        include: { items: true },
      });
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { poNumber: legacy.poNumber ?? `PO-${String(po.id).padStart(6, "0")}` },
      });
      await tx.purchaseOrderStatusHistory.create({
        data: {
          toStatus: poStatus,
          purchaseOrderId: po.id,
          notes: `Migrated from legacy procurement item #${legacy.id}`,
        },
      });
      migratedWithPo += 1;

      if (legacy.status !== "delivered") return;

      // Best-effort warehouse/receiver lookup for display purposes only — never
      // used to mutate InventoryItem (see the data-safety note above).
      const matchingInventoryItem = await tx.inventoryItem.findFirst({
        where: legacy.itemId
          ? { projectId: legacy.project!.id, itemId: legacy.itemId }
          : { projectId: legacy.project!.id, itemName: legacy.itemName, itemId: null },
      });

      const grn = await tx.goodsReceipt.create({
        data: {
          purchaseOrderId: po.id,
          warehouseId: matchingInventoryItem?.warehouseId ?? null,
          receivedById: legacy.requestedById,
          status: "accepted",
          inspectionResult: "Migrated from legacy delivered procurement item — assumed accepted in full.",
          items: {
            create: [
              {
                purchaseOrderItemId: po.items[0]!.id,
                receivedQuantity: legacy.quantity,
                damagedQuantity: 0,
              },
            ],
          },
        },
      });
      await tx.goodsReceipt.update({
        where: { id: grn.id },
        data: { grnNumber: `GRN-${String(grn.id).padStart(6, "0")}` },
      });
      migratedWithGrn += 1;
    });
  }

  console.log(
    `Migration complete: ${migratedPrOnly} PR-only, ${migratedWithPo} with PO, ${migratedWithGrn} with GRN, ${skipped} skipped (already migrated or orphaned).`,
  );
}

if (require.main === module) {
  migrateProcurementToPrPo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
