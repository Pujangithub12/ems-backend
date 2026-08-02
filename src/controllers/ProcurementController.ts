import { Response } from "express";
import { prisma } from "../config/prisma";
import { InventoryController } from "./InventoryController";
import { AuthRequest } from "../middlewares/auth";
import { AddProcurementItemDto, UpdateProcurementItemDto } from "../dto/procurement.dto";
import { computeLandedUnitCost } from "../utils/procurementCost";

/** Postgres `numeric` (Decimal) columns come back as Prisma's Decimal wrapper, not a plain number — coerce for arithmetic helpers like computeLandedUnitCost. */
const decimalToNumber = (value: { toNumber(): number } | null | undefined): number | null =>
  value == null ? null : value.toNumber();

/** Procurement tab: purchase-request line items scoped to a project. */
export class ProcurementController {
  /** GET /organization/procurement — aggregated across every project in the organization, for the sidebar Procurement page. */
  static getOrganizationProcurement = async (req: AuthRequest, res: Response) => {
    try {
      const items = await prisma.procurementItem.findMany({
        where: { project: { organizationId: req.organization!.id } },
        include: { requestedBy: true, project: true, vendor: true, item: true },
        orderBy: { createdAt: "desc" },
      });

      const result = items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        item: item.item ? { id: item.item.id, name: item.item.name, code: item.item.code } : null,
        poNumber: item.poNumber,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        estimatedCost: item.estimatedCost,
        unitCost: item.unitCost,
        taxPercent: item.taxPercent,
        discountPercent: item.discountPercent,
        transportCost: item.transportCost,
        customsCost: item.customsCost,
        vendorName: item.vendorName,
        vendor: item.vendor ? { id: item.vendor.id, name: item.vendor.name } : null,
        neededByDate: item.neededByDate,
        status: item.status,
        notes: item.notes,
        requestedBy: item.requestedBy,
        createdAt: item.createdAt,
        projectId: item.project!.id,
        projectName: item.project!.name,
      }));

      return res.status(200).json({ items: result });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /projects/:projectId/procurement — flat list for the Procurement tab. Open to any organization member. */
  static getProcurementItems = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: parseInt(projectId as string),
          organizationId: req.organization!.id,
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const items = await prisma.procurementItem.findMany({
        where: { projectId: project.id },
        include: { requestedBy: true, vendor: true, item: true },
        orderBy: { createdAt: "desc" },
      });

      return res.status(200).json({ items });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /projects/:projectId/procurement — add a purchase request. Admin-gated (see routes.ts). */
  static addProcurementItem = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const {
      itemName,
      itemId,
      category,
      quantity,
      unit,
      estimatedCost,
      unitCost,
      taxPercent,
      discountPercent,
      transportCost,
      customsCost,
      vendorName,
      vendorId,
      neededByDate,
      notes,
    }: AddProcurementItemDto = req.body;

    try {
      const project = await prisma.project.findFirst({
        where: {
          id: parseInt(projectId as string),
          organizationId: req.organization!.id,
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Prefer the catalog reference when given, so item naming stays
      // consistent with the shared catalog instead of trusting a freehand
      // itemName — itemName is still required on the DTO for legacy callers
      // (e.g. CSV import) that don't go through the catalog.
      let catalogItem = null as Awaited<ReturnType<typeof prisma.catalogItem.findFirst>> | null;
      if (itemId) {
        catalogItem = await prisma.catalogItem.findFirst({
          where: { id: itemId, organizationId: req.organization!.id },
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

      const requestedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
      const vendor = vendorId
        ? await prisma.vendor.findFirst({
            where: { id: vendorId, organizationId: req.organization!.id },
          })
        : null;

      const createdRow = await prisma.procurementItem.create({
        data: {
          itemName: trimmedName,
          quantity: quantity && quantity > 0 ? Math.round(quantity) : 1,
          projectId: project.id,
          organizationId: req.organization!.id,
          ...(category ? { category } : {}),
          ...(unit ? { unit } : {}),
          ...(estimatedCost !== undefined ? { estimatedCost } : {}),
          ...(unitCost !== undefined ? { unitCost } : {}),
          ...(taxPercent !== undefined ? { taxPercent } : {}),
          ...(discountPercent !== undefined ? { discountPercent } : {}),
          ...(transportCost !== undefined ? { transportCost } : {}),
          ...(customsCost !== undefined ? { customsCost } : {}),
          ...(vendorName ? { vendorName } : {}),
          ...(vendor ? { vendorId: vendor.id } : {}),
          ...(catalogItem ? { itemId: catalogItem.id } : {}),
          ...(neededByDate ? { neededByDate: new Date(neededByDate) } : {}),
          ...(notes ? { notes } : {}),
          ...(requestedBy ? { requestedById: requestedBy.id } : {}),
        },
      });

      const poNumber = `PO-${String(createdRow.id).padStart(6, "0")}`;
      const updatedRow = await prisma.procurementItem.update({
        where: { id: createdRow.id },
        data: { poNumber },
      });

      await prisma.procurementStatusHistory.create({
        data: {
          toStatus: updatedRow.status,
          procurementItemId: updatedRow.id,
          ...(requestedBy ? { changedById: requestedBy.id } : {}),
        },
      });

      const item = {
        ...updatedRow,
        project,
        ...(vendor ? { vendor } : {}),
        ...(catalogItem ? { item: catalogItem } : {}),
        ...(requestedBy ? { requestedBy } : {}),
      };

      return res.status(201).json({ message: "Procurement item added", item });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /projects/procurement/:itemId — update fields and/or status. Admin-gated. */
  static updateProcurementItem = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const {
      itemName,
      itemId: catalogItemId,
      category,
      quantity,
      unit,
      estimatedCost,
      unitCost,
      taxPercent,
      discountPercent,
      transportCost,
      customsCost,
      vendorName,
      vendorId,
      neededByDate,
      status,
      notes,
    }: UpdateProcurementItemDto = req.body;

    try {
      const existing = await prisma.procurementItem.findFirst({
        where: { id: parseInt(itemId as string) },
        include: { project: true, vendor: true, item: true },
      });

      if (!existing || !existing.project || existing.project.organizationId !== req.organization!.id) {
        return res.status(404).json({ message: "Procurement item not found" });
      }

      const previousStatus = existing.status;
      const data: any = {};

      if (itemName !== undefined) {
        const trimmedName = itemName.trim();
        if (!trimmedName) {
          return res.status(400).json({ message: "Item name is required" });
        }
        data.itemName = trimmedName;
      }
      if (category !== undefined) data.category = category;
      if (quantity !== undefined) data.quantity = Math.round(quantity) || 1;
      if (unit !== undefined) data.unit = unit;
      if (estimatedCost !== undefined) data.estimatedCost = estimatedCost;
      if (unitCost !== undefined) data.unitCost = unitCost;
      if (taxPercent !== undefined) data.taxPercent = taxPercent;
      if (discountPercent !== undefined) data.discountPercent = discountPercent;
      if (transportCost !== undefined) data.transportCost = transportCost;
      if (customsCost !== undefined) data.customsCost = customsCost;
      if (vendorName !== undefined) data.vendorName = vendorName;

      let vendor = existing.vendor;
      if (vendorId !== undefined) {
        if (vendorId === null) {
          data.vendorId = null;
          vendor = null;
        } else {
          const foundVendor = await prisma.vendor.findFirst({
            where: { id: vendorId, organizationId: req.organization!.id },
          });
          if (foundVendor) {
            data.vendorId = foundVendor.id;
            vendor = foundVendor;
          }
        }
      }

      if (neededByDate !== undefined) {
        data.neededByDate = neededByDate ? new Date(neededByDate) : null;
      }
      if (status !== undefined) data.status = status;
      if (notes !== undefined) data.notes = notes;

      // Applied last so a catalog reference wins over any conflicting
      // freeform itemName sent in the same request — the catalog is the
      // source of truth once an item is linked to it.
      let catalogItem = existing.item;
      if (catalogItemId !== undefined) {
        if (catalogItemId === null) {
          data.itemId = null;
          catalogItem = null;
        } else {
          const foundCatalogItem = await prisma.catalogItem.findFirst({
            where: { id: catalogItemId, organizationId: req.organization!.id },
          });
          if (!foundCatalogItem) {
            return res.status(400).json({ message: "Selected item not found" });
          }
          catalogItem = foundCatalogItem;
          data.itemId = foundCatalogItem.id;
          data.itemName = foundCatalogItem.name;
        }
      }

      const updatedRow = await prisma.procurementItem.update({
        where: { id: existing.id },
        data,
      });

      const item = {
        ...updatedRow,
        project: existing.project,
        vendor: vendor ?? null,
        item: catalogItem ?? null,
      };

      if (status !== undefined && status !== previousStatus) {
        const changedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
        await prisma.procurementStatusHistory.create({
          data: {
            fromStatus: previousStatus,
            toStatus: status,
            procurementItemId: updatedRow.id,
            ...(changedBy ? { changedById: changedBy.id } : {}),
          },
        });

        // Marking a purchase request delivered means the goods are in hand —
        // fold it into the project's Inventory automatically instead of
        // requiring a separate manual entry (merges into an existing row for
        // the same item, same dedup rule as InventoryController.addInventoryItem).
        // The stored unit cost is the landed cost (tax/discount/transport/
        // customs folded in and divided back to a per-unit figure) so stock
        // valuation reflects the true cost of bringing the item in.
        if (status === "delivered") {
          await InventoryController.receiveFromProcurement({
            project: existing.project,
            organization: req.organization!,
            catalogItem: catalogItem ?? null,
            itemName: updatedRow.itemName,
            quantity: updatedRow.quantity,
            unit: updatedRow.unit,
            unitCost: computeLandedUnitCost({
              unitCost: decimalToNumber(updatedRow.unitCost),
              estimatedCost: decimalToNumber(updatedRow.estimatedCost),
              quantity: updatedRow.quantity,
              discountPercent: decimalToNumber(updatedRow.discountPercent),
              taxPercent: decimalToNumber(updatedRow.taxPercent),
              transportCost: decimalToNumber(updatedRow.transportCost),
              customsCost: decimalToNumber(updatedRow.customsCost),
            }),
            vendor: vendor ?? null,
            poNumber: updatedRow.poNumber,
            userId: req.user!.id,
          });
        }
      }

      return res.status(200).json({ message: "Procurement item updated", item });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /projects/procurement/:itemId — admin-gated. */
  static deleteProcurementItem = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    try {
      const item = await prisma.procurementItem.findFirst({
        where: { id: parseInt(itemId as string) },
        include: { project: true },
      });

      if (!item || item.project?.organizationId !== req.organization!.id) {
        return res.status(404).json({ message: "Procurement item not found" });
      }

      await prisma.procurementItem.delete({ where: { id: item.id } });
      return res.status(200).json({ message: "Procurement item deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  private static async loadOwnedItem(itemId: string, organizationId: number) {
    const item = await prisma.procurementItem.findFirst({
      where: { id: parseInt(itemId) },
      include: { project: true, vendor: true, item: true },
    });
    if (!item || item.project?.organizationId !== organizationId) return null;
    return item;
  }

  /** POST /projects/procurement/:itemId/attachments — upload a document. Admin-gated. Expects multer single("file"). */
  static addAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });

    try {
      const item = await ProcurementController.loadOwnedItem(itemId as string, req.organization!.id);
      if (!item) return res.status(404).json({ message: "Procurement item not found" });

      const uploadedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });

      const attachment = await prisma.procurementAttachment.create({
        data: {
          fileName: file.originalname,
          filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
          procurementItemId: item.id,
          ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
        },
      });

      return res.status(201).json({ message: "Attachment uploaded", attachment });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /projects/procurement/:itemId/attachments/:attachmentId — admin-gated. */
  static deleteAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId, attachmentId } = req.params;
    try {
      const item = await ProcurementController.loadOwnedItem(itemId as string, req.organization!.id);
      if (!item) return res.status(404).json({ message: "Procurement item not found" });

      const attachment = await prisma.procurementAttachment.findFirst({
        where: { id: parseInt(attachmentId as string), procurementItemId: item.id },
      });
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });

      await prisma.procurementAttachment.delete({ where: { id: attachment.id } });
      return res.status(200).json({ message: "Attachment deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /projects/procurement/:itemId/detail — everything the drawer needs:
   * status timeline, attachments, and other purchase requests for the same
   * item name across the organization (Project Allocation section).
   */
  static getProcurementItemDetail = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    try {
      const item = await ProcurementController.loadOwnedItem(itemId as string, req.organization!.id);
      if (!item) return res.status(404).json({ message: "Procurement item not found" });

      const [statusHistory, attachments, projectAllocation] = await Promise.all([
        prisma.procurementStatusHistory.findMany({
          where: { procurementItemId: item.id },
          include: { changedBy: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.procurementAttachment.findMany({
          where: { procurementItemId: item.id },
          include: { uploadedBy: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.procurementItem.findMany({
          where: { itemName: item.itemName, project: { organizationId: req.organization!.id } },
          include: { project: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return res.status(200).json({
        item,
        statusHistory,
        attachments,
        projectAllocation: projectAllocation.filter((row) => row.id !== item.id),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
