import { Response } from "express";
import { prisma } from "../config/prisma";
import { InventoryController } from "./InventoryController";
import { AuthRequest } from "../middlewares/auth";
import { AddGoodsReceiptDto, UpdateGoodsReceiptStatusDto } from "../dto/goodsReceipt.dto";
import { computeCostSheet } from "../utils/costSheet";

/** Include shape used when returning a goods receipt to the client after create/status-update. */
const DETAIL_INCLUDE = {
  items: true,
  warehouse: true,
} as const;

/** Statuses that represent "goods are in hand" — reaching either of these for the first time is
 * what triggers the one-time Inventory increment in updateStatus (see the guard there). */
const ACCEPTED_STATUSES = ["accepted", "partially_accepted"];

/** Goods Receipt (GRN) — final step of the procurement pipeline: Purchase Request -> Vendor
 * Selection -> Purchase Order -> Proforma Invoice -> Shipment/Insurance/Customs -> Cost Sheet ->
 * Goods Receipt -> Inventory. Accepting a GRN is the only place this pipeline increments real
 * Inventory stock (via InventoryController.receiveFromProcurement), so the previous-status guard
 * in updateStatus must never let that happen more than once per GRN. */
export class GoodsReceiptController {
  /** GET /workspace/goods-receipts — aggregated across every PO in the organization, for the mobile GRN inbox. */
  static getOrganizationGoodsReceipts = async (req: AuthRequest, res: Response) => {
    try {
      const goodsReceipts = await prisma.goodsReceipt.findMany({
        where: { purchaseOrder: { organizationId: req.organization!.id } },
        include: {
          items: true,
          warehouse: true,
          receivedBy: true,
          purchaseOrder: { select: { id: true, poNumber: true, project: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ goodsReceipts });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-orders/:id/goods-receipts — record a receipt of goods against a PO's line items. Admin-gated (see routes.ts). */
  static addGoodsReceipt = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { warehouseId, inspectionResult, items }: AddGoodsReceiptDto = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    try {
      const purchaseOrder = await prisma.purchaseOrder.findFirst({
        where: { id: parseInt(id as string), organizationId: req.organization!.id },
        include: { items: true },
      });
      if (!purchaseOrder) return res.status(404).json({ message: "Purchase order not found" });

      const validItemIds = new Set(purchaseOrder.items.map((item) => item.id));
      for (const line of items) {
        if (!validItemIds.has(line.purchaseOrderItemId)) {
          return res.status(400).json({ message: "One or more items do not belong to this purchase order" });
        }
      }

      let warehouse = null as Awaited<ReturnType<typeof prisma.warehouse.findFirst>> | null;
      if (warehouseId !== undefined && warehouseId !== null) {
        warehouse = await prisma.warehouse.findFirst({
          where: { id: warehouseId, organizationId: req.organization!.id },
        });
        if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });
      }

      const created = await prisma.goodsReceipt.create({
        data: {
          purchaseOrderId: purchaseOrder.id,
          status: "pending_inspection",
          receivedById: req.user!.id,
          ...(warehouse ? { warehouseId: warehouse.id } : {}),
          ...(inspectionResult ? { inspectionResult } : {}),
          items: {
            create: items.map((line) => ({
              purchaseOrderItemId: line.purchaseOrderItemId,
              receivedQuantity: Math.max(0, Math.round(line.receivedQuantity)),
              damagedQuantity: line.damagedQuantity !== undefined ? Math.max(0, Math.round(line.damagedQuantity)) : 0,
            })),
          },
        },
      });

      const grnNumber = `GRN-${String(created.id).padStart(6, "0")}`;
      await prisma.goodsReceipt.update({ where: { id: created.id }, data: { grnNumber } });

      const goodsReceipt = await prisma.goodsReceipt.findUnique({
        where: { id: created.id },
        include: DETAIL_INCLUDE,
      });

      return res.status(201).json({ message: "Goods receipt recorded", goodsReceipt });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** Loads a goods receipt scoped to the caller's organization (via its purchase order), or null. */
  private static async loadOwnedGoodsReceipt(id: string, organizationId: number) {
    const result = await prisma.goodsReceipt.findFirst({
      where: { id: parseInt(id) },
      include: {
        purchaseOrder: true,
        items: { include: { purchaseOrderItem: { include: { item: true } } } },
      },
    });
    if (!result || result.purchaseOrder?.organizationId !== organizationId) return null;
    return result;
  }

  /**
   * PUT /goods-receipts/:id/status — the critical endpoint: accepting/partially-accepting a GRN
   * increments real Inventory stock exactly once. Admin-gated.
   */
  static updateStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status, inspectionResult }: UpdateGoodsReceiptStatusDto = req.body;

    try {
      const existing = await GoodsReceiptController.loadOwnedGoodsReceipt(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Goods receipt not found" });

      const previousStatus = existing.status;

      const data: any = { status };
      if (inspectionResult !== undefined) data.inspectionResult = inspectionResult;
      await prisma.goodsReceipt.update({ where: { id: existing.id }, data });

      // Guard: only increment Inventory the first time this GRN transitions into an
      // "accepted"/"partially_accepted" state. Re-saving an already-accepted GRN, or toggling
      // between "accepted" and "partially_accepted", must never double-count stock.
      const shouldReceiveIntoInventory =
        !ACCEPTED_STATUSES.includes(previousStatus) && ACCEPTED_STATUSES.includes(status);

      if (shouldReceiveIntoInventory) {
        const purchaseOrder = await prisma.purchaseOrder.findUnique({
          where: { id: existing.purchaseOrderId! },
          include: { project: true, organization: true, vendor: true },
        });

        if (purchaseOrder && purchaseOrder.project && purchaseOrder.organization) {
          const costSheet = await computeCostSheet(purchaseOrder.id);

          for (const item of existing.items) {
            const goodQuantity = Math.max(0, item.receivedQuantity - item.damagedQuantity);
            if (goodQuantity <= 0) continue;

            await InventoryController.receiveFromProcurement({
              project: purchaseOrder.project,
              organization: purchaseOrder.organization,
              catalogItem: item.purchaseOrderItem?.item ?? null,
              itemName: item.purchaseOrderItem?.itemName ?? "Unknown item",
              quantity: goodQuantity,
              unit: item.purchaseOrderItem?.unit,
              unitCost: costSheet?.landedCostPerUnit ?? null,
              vendor: purchaseOrder.vendor ?? null,
              poNumber: purchaseOrder.poNumber,
              userId: req.user!.id,
            });
          }
        }
      }

      const goodsReceipt = await prisma.goodsReceipt.findUnique({
        where: { id: existing.id },
        include: { items: true, warehouse: true, receivedBy: true },
      });

      return res.status(200).json({ message: "Goods receipt status updated", goodsReceipt });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /goods-receipts/:itemId/photos — upload an inspection photo. Admin-gated. Expects multer single("file"). */
  static addPhoto = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });

    try {
      const goodsReceipt = await GoodsReceiptController.loadOwnedGoodsReceipt(itemId as string, req.organization!.id);
      if (!goodsReceipt) return res.status(404).json({ message: "Goods receipt not found" });

      const photo = await prisma.goodsReceiptPhoto.create({
        data: {
          fileName: file.originalname,
          filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
          goodsReceiptId: goodsReceipt.id,
        },
      });

      return res.status(201).json({ message: "Photo uploaded", photo });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /goods-receipts/:itemId/photos/:photoId — admin-gated. */
  static deletePhoto = async (req: AuthRequest, res: Response) => {
    const { itemId, photoId } = req.params;
    try {
      const goodsReceipt = await GoodsReceiptController.loadOwnedGoodsReceipt(itemId as string, req.organization!.id);
      if (!goodsReceipt) return res.status(404).json({ message: "Goods receipt not found" });

      const photo = await prisma.goodsReceiptPhoto.findFirst({
        where: { id: parseInt(photoId as string), goodsReceiptId: goodsReceipt.id },
      });
      if (!photo) return res.status(404).json({ message: "Photo not found" });

      await prisma.goodsReceiptPhoto.delete({ where: { id: photo.id } });
      return res.status(200).json({ message: "Photo deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
