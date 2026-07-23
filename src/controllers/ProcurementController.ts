import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Project } from "../entities/Project";
import { ProcurementItem } from "../entities/ProcurementItem";
import { ProcurementStatusHistory } from "../entities/ProcurementStatusHistory";
import { ProcurementAttachment } from "../entities/ProcurementAttachment";
import { User } from "../entities/User";
import { Vendor } from "../entities/Vendor";
import { CatalogItem } from "../entities/CatalogItem";
import { AuthRequest } from "../middlewares/auth";
import { AddProcurementItemDto, UpdateProcurementItemDto } from "../dto/procurement.dto";

/** Procurement tab: purchase-request line items scoped to a project. */
export class ProcurementController {
  /** GET /workspace/procurement — aggregated across every project in the workspace, for the sidebar Procurement page. */
  static getWorkspaceProcurement = async (req: AuthRequest, res: Response) => {
    try {
      const itemRepository = AppDataSource.getRepository(ProcurementItem);

      const items = await itemRepository.find({
        where: { project: { workspace: { id: req.workspace!.id } } },
        relations: ["requestedBy", "project", "vendor", "item"],
        order: { createdAt: "DESC" },
      });

      const result = items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        item: item.item ? { id: item.item.id, name: item.item.name, code: item.item.code } : null,
        poNumber: item.poNumber,
        category: item.category,
        quantity: item.quantity,
        estimatedCost: item.estimatedCost,
        unitCost: item.unitCost,
        vendorName: item.vendorName,
        vendor: item.vendor ? { id: item.vendor.id, name: item.vendor.name } : null,
        neededByDate: item.neededByDate,
        status: item.status,
        notes: item.notes,
        requestedBy: item.requestedBy,
        createdAt: item.createdAt,
        projectId: item.project.id,
        projectName: item.project.name,
      }));

      return res.status(200).json({ items: result });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /projects/:projectId/procurement — flat list for the Procurement tab. Open to any workspace member. */
  static getProcurementItems = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const itemRepository = AppDataSource.getRepository(ProcurementItem);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const items = await itemRepository.find({
        where: { project: { id: project.id } },
        relations: ["requestedBy", "vendor", "item"],
        order: { createdAt: "DESC" },
      });

      return res.status(200).json({ items });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
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
      estimatedCost,
      unitCost,
      vendorName,
      vendorId,
      neededByDate,
      notes,
    }: AddProcurementItemDto = req.body;

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const userRepository = AppDataSource.getRepository(User);
      const itemRepository = AppDataSource.getRepository(ProcurementItem);
      const catalogItemRepository = AppDataSource.getRepository(CatalogItem);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Prefer the catalog reference when given, so item naming stays
      // consistent with the shared catalog instead of trusting a freehand
      // itemName — itemName is still required on the DTO for legacy callers
      // (e.g. CSV import) that don't go through the catalog.
      let catalogItem: CatalogItem | null = null;
      if (itemId) {
        catalogItem = await catalogItemRepository.findOne({
          where: { id: itemId, workspace: { id: req.workspace!.id } },
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

      const requestedBy = await userRepository.findOneBy({ id: req.user!.id });
      const vendor = vendorId
        ? await AppDataSource.getRepository(Vendor).findOne({
            where: { id: vendorId, workspace: { id: req.workspace!.id } },
          })
        : null;

      const itemData: Partial<ProcurementItem> = {
        itemName: trimmedName,
        quantity: quantity && quantity > 0 ? Math.round(quantity) : 1,
        project,
        workspace: req.workspace!,
        ...(category ? { category } : {}),
        ...(estimatedCost !== undefined ? { estimatedCost } : {}),
        ...(unitCost !== undefined ? { unitCost } : {}),
        ...(vendorName ? { vendorName } : {}),
        ...(vendor ? { vendor } : {}),
        ...(catalogItem ? { item: catalogItem } : {}),
        ...(neededByDate ? { neededByDate: new Date(neededByDate) } : {}),
        ...(notes ? { notes } : {}),
        ...(requestedBy ? { requestedBy } : {}),
      };

      const item = itemRepository.create(itemData);
      await itemRepository.save(item);

      item.poNumber = `PO-${String(item.id).padStart(6, "0")}`;
      await itemRepository.save(item);

      const historyRepository = AppDataSource.getRepository(ProcurementStatusHistory);
      await historyRepository.save(
        historyRepository.create({
          toStatus: item.status,
          procurementItem: item,
          ...(requestedBy ? { changedBy: requestedBy } : {}),
        }),
      );

      return res.status(201).json({ message: "Procurement item added", item });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
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
      estimatedCost,
      unitCost,
      vendorName,
      vendorId,
      neededByDate,
      status,
      notes,
    }: UpdateProcurementItemDto = req.body;

    try {
      const itemRepository = AppDataSource.getRepository(ProcurementItem);
      const userRepository = AppDataSource.getRepository(User);
      const vendorRepository = AppDataSource.getRepository(Vendor);
      const catalogItemRepository = AppDataSource.getRepository(CatalogItem);
      const item = await itemRepository.findOne({
        where: { id: parseInt(itemId as string) },
        relations: ["project", "project.workspace", "vendor", "item"],
      });

      if (!item || item.project.workspace?.id !== req.workspace!.id) {
        return res.status(404).json({ message: "Procurement item not found" });
      }

      const previousStatus = item.status;

      if (itemName !== undefined) {
        const trimmedName = itemName.trim();
        if (!trimmedName) {
          return res.status(400).json({ message: "Item name is required" });
        }
        item.itemName = trimmedName;
      }
      if (category !== undefined) item.category = category;
      if (quantity !== undefined) item.quantity = Math.round(quantity) || 1;
      if (estimatedCost !== undefined) {
        // null (not undefined) so TypeORM actually issues SET estimatedCost = NULL
        // instead of silently excluding the column from the UPDATE.
        item.estimatedCost = estimatedCost === null ? (null as unknown as number) : estimatedCost;
      }
      if (unitCost !== undefined) {
        item.unitCost = unitCost === null ? (null as unknown as number) : unitCost;
      }
      if (vendorName !== undefined) item.vendorName = vendorName;
      if (vendorId !== undefined) {
        if (vendorId === null) {
          item.vendor = null as unknown as Vendor;
        } else {
          const vendor = await vendorRepository.findOne({
            where: { id: vendorId, workspace: { id: req.workspace!.id } },
          });
          if (vendor) item.vendor = vendor;
        }
      }
      if (neededByDate !== undefined) {
        item.neededByDate = neededByDate ? new Date(neededByDate) : (null as unknown as Date);
      }
      if (status !== undefined) item.status = status;
      if (notes !== undefined) item.notes = notes;

      // Applied last so a catalog reference wins over any conflicting
      // freeform itemName sent in the same request — the catalog is the
      // source of truth once an item is linked to it.
      if (catalogItemId !== undefined) {
        if (catalogItemId === null) {
          item.item = null;
        } else {
          const catalogItem = await catalogItemRepository.findOne({
            where: { id: catalogItemId, workspace: { id: req.workspace!.id } },
          });
          if (!catalogItem) {
            return res.status(400).json({ message: "Selected item not found" });
          }
          item.item = catalogItem;
          item.itemName = catalogItem.name;
        }
      }

      await itemRepository.save(item);

      if (status !== undefined && status !== previousStatus) {
        const changedBy = await userRepository.findOneBy({ id: req.user!.id });
        const historyRepository = AppDataSource.getRepository(ProcurementStatusHistory);
        await historyRepository.save(
          historyRepository.create({
            fromStatus: previousStatus,
            toStatus: status,
            procurementItem: item,
            ...(changedBy ? { changedBy } : {}),
          }),
        );
      }

      return res.status(200).json({ message: "Procurement item updated", item });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /projects/procurement/:itemId — admin-gated. */
  static deleteProcurementItem = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    try {
      const itemRepository = AppDataSource.getRepository(ProcurementItem);
      const item = await itemRepository.findOne({
        where: { id: parseInt(itemId as string) },
        relations: ["project", "project.workspace"],
      });

      if (!item || item.project.workspace?.id !== req.workspace!.id) {
        return res.status(404).json({ message: "Procurement item not found" });
      }

      await itemRepository.remove(item);
      return res.status(200).json({ message: "Procurement item deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  private static async loadOwnedItem(itemId: string, workspaceId: number) {
    const itemRepository = AppDataSource.getRepository(ProcurementItem);
    const item = await itemRepository.findOne({
      where: { id: parseInt(itemId) },
      relations: ["project", "project.workspace", "vendor", "item"],
    });
    if (!item || item.project.workspace?.id !== workspaceId) return null;
    return item;
  }

  /** POST /projects/procurement/:itemId/attachments — upload a document. Admin-gated. Expects multer single("file"). */
  static addAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });

    try {
      const item = await ProcurementController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Procurement item not found" });

      const userRepository = AppDataSource.getRepository(User);
      const uploadedBy = await userRepository.findOneBy({ id: req.user!.id });

      const attachmentRepository = AppDataSource.getRepository(ProcurementAttachment);
      const attachment = attachmentRepository.create({
        fileName: file.originalname,
        filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
        procurementItem: item,
        ...(uploadedBy ? { uploadedBy } : {}),
      });
      await attachmentRepository.save(attachment);

      return res.status(201).json({ message: "Attachment uploaded", attachment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /projects/procurement/:itemId/attachments/:attachmentId — admin-gated. */
  static deleteAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId, attachmentId } = req.params;
    try {
      const item = await ProcurementController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Procurement item not found" });

      const attachmentRepository = AppDataSource.getRepository(ProcurementAttachment);
      const attachment = await attachmentRepository.findOne({
        where: { id: parseInt(attachmentId as string), procurementItem: { id: item.id } },
      });
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });

      await attachmentRepository.remove(attachment);
      return res.status(200).json({ message: "Attachment deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /**
   * GET /projects/procurement/:itemId/detail — everything the drawer needs:
   * status timeline, attachments, and other purchase requests for the same
   * item name across the workspace (Project Allocation section).
   */
  static getProcurementItemDetail = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    try {
      const item = await ProcurementController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Procurement item not found" });

      const [statusHistory, attachments, projectAllocation] = await Promise.all([
        AppDataSource.getRepository(ProcurementStatusHistory).find({
          where: { procurementItem: { id: item.id } },
          relations: ["changedBy"],
          order: { createdAt: "DESC" },
        }),
        AppDataSource.getRepository(ProcurementAttachment).find({
          where: { procurementItem: { id: item.id } },
          relations: ["uploadedBy"],
          order: { createdAt: "DESC" },
        }),
        AppDataSource.getRepository(ProcurementItem).find({
          where: { itemName: item.itemName, project: { workspace: { id: req.workspace!.id } } },
          relations: ["project"],
          order: { createdAt: "DESC" },
        }),
      ]);

      return res.status(200).json({
        item,
        statusHistory,
        attachments,
        projectAllocation: projectAllocation.filter((row) => row.id !== item.id),
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
