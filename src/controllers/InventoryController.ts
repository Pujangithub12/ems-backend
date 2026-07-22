import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Project } from "../entities/Project";
import { InventoryItem } from "../entities/InventoryItem";
import { User } from "../entities/User";
import { Warehouse } from "../entities/Warehouse";
import { Vendor } from "../entities/Vendor";
import { InventoryBatch } from "../entities/InventoryBatch";
import { InventorySerial } from "../entities/InventorySerial";
import { InventoryTransaction, InventoryTransactionType } from "../entities/InventoryTransaction";
import { StockTransfer } from "../entities/StockTransfer";
import { InventoryAttachment } from "../entities/InventoryAttachment";
import { ProcurementItem } from "../entities/ProcurementItem";
import { AuthRequest } from "../middlewares/auth";
import {
  AddInventoryItemDto,
  UpdateInventoryItemDto,
  AdjustInventoryStockDto,
} from "../dto/inventory.dto";
import { AddWarehouseDto } from "../dto/warehouse.dto";
import { AddVendorDto, UpdateVendorDto } from "../dto/vendor.dto";
import { CreateStockTransferDto, UpdateStockTransferDto } from "../dto/stockTransfer.dto";
import { AddInventoryBatchDto } from "../dto/inventoryBatch.dto";
import { AddInventorySerialDto } from "../dto/inventorySerial.dto";

/** Writes an audit-log row for a stock-affecting mutation. Never throws — best-effort. */
async function logTransaction(
  item: InventoryItem,
  type: InventoryTransactionType,
  quantityChange: number,
  resultingQuantity: number,
  reason: string | undefined,
  userId: number | undefined,
  workspaceId: number,
) {
  const txRepository = AppDataSource.getRepository(InventoryTransaction);
  const userRepository = AppDataSource.getRepository(User);
  const performedBy = userId ? await userRepository.findOneBy({ id: userId }) : null;
  const tx = txRepository.create({
    type,
    quantityChange,
    resultingQuantity,
    inventoryItem: item,
    workspace: { id: workspaceId } as any,
    ...(reason ? { reason } : {}),
    ...(performedBy ? { performedBy } : {}),
  });
  await txRepository.save(tx);
}

/** Inventory tab: stock items scoped to a project. */
export class InventoryController {
  /** GET /workspace/inventory — aggregated across every project in the workspace, for the sidebar Inventory page. */
  static getWorkspaceInventory = async (req: AuthRequest, res: Response) => {
    try {
      const itemRepository = AppDataSource.getRepository(InventoryItem);

      const items = await itemRepository.find({
        where: { project: { workspace: { id: req.workspace!.id } } },
        relations: ["updatedBy", "project", "warehouse", "vendor"],
        order: { createdAt: "DESC" },
      });

      const result = items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /projects/:projectId/inventory — flat list for the Inventory tab. Open to any workspace member. */
  static getInventoryItems = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const itemRepository = AppDataSource.getRepository(InventoryItem);

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
        relations: ["updatedBy", "warehouse", "vendor"],
        order: { createdAt: "DESC" },
      });

      return res.status(200).json({ items });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /projects/:projectId/inventory — add a stock item. Admin-gated (see routes.ts). */
  static addInventoryItem = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const {
      itemName,
      category,
      quantity,
      unit,
      status,
      lastRestockedDate,
      notes,
      sku,
      warehouseId,
      reservedQuantity,
      incomingQuantity,
      averageCost,
      supplier,
      vendorId,
      imageUrl,
      warrantyExpiryDate,
    }: AddInventoryItemDto = req.body;

    const trimmedName = typeof itemName === "string" ? itemName.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Item name is required" });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const userRepository = AppDataSource.getRepository(User);
      const itemRepository = AppDataSource.getRepository(InventoryItem);
      const warehouseRepository = AppDataSource.getRepository(Warehouse);
      const vendorRepository = AppDataSource.getRepository(Vendor);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const updatedBy = await userRepository.findOneBy({ id: req.user!.id });
      const warehouse = warehouseId
        ? await warehouseRepository.findOne({
            where: { id: warehouseId, workspace: { id: req.workspace!.id } },
          })
        : null;
      const vendor = vendorId
        ? await vendorRepository.findOne({
            where: { id: vendorId, workspace: { id: req.workspace!.id } },
          })
        : null;

      const finalQuantity = quantity && quantity > 0 ? Math.round(quantity) : 0;

      const itemData: Partial<InventoryItem> = {
        itemName: trimmedName,
        quantity: finalQuantity,
        project,
        workspace: req.workspace!,
        ...(category ? { category } : {}),
        ...(unit ? { unit } : {}),
        ...(status ? { status } : {}),
        ...(lastRestockedDate ? { lastRestockedDate: new Date(lastRestockedDate) } : {}),
        ...(notes ? { notes } : {}),
        ...(sku ? { sku } : {}),
        ...(warehouse ? { warehouse } : {}),
        ...(reservedQuantity !== undefined ? { reservedQuantity: Math.max(0, Math.round(reservedQuantity)) } : {}),
        ...(incomingQuantity !== undefined ? { incomingQuantity: Math.max(0, Math.round(incomingQuantity)) } : {}),
        ...(averageCost !== undefined ? { averageCost } : {}),
        ...(supplier ? { supplier } : {}),
        ...(vendor ? { vendor } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(warrantyExpiryDate ? { warrantyExpiryDate: new Date(warrantyExpiryDate) } : {}),
        ...(updatedBy ? { updatedBy } : {}),
      };

      const item = itemRepository.create(itemData);
      await itemRepository.save(item);

      if (finalQuantity > 0) {
        await logTransaction(item, "receipt", finalQuantity, finalQuantity, "Initial stock", req.user!.id, req.workspace!.id);
      }

      return res.status(201).json({ message: "Inventory item added", item });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** PUT /projects/inventory/:itemId — update fields and/or status. Admin-gated. */
  static updateInventoryItem = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const {
      itemName,
      category,
      quantity,
      unit,
      status,
      lastRestockedDate,
      notes,
      sku,
      warehouseId,
      reservedQuantity,
      incomingQuantity,
      averageCost,
      supplier,
      vendorId,
      imageUrl,
      warrantyExpiryDate,
    }: UpdateInventoryItemDto = req.body;

    try {
      const itemRepository = AppDataSource.getRepository(InventoryItem);
      const userRepository = AppDataSource.getRepository(User);
      const warehouseRepository = AppDataSource.getRepository(Warehouse);
      const vendorRepository = AppDataSource.getRepository(Vendor);
      const item = await itemRepository.findOne({
        where: { id: parseInt(itemId as string) },
        relations: ["project", "project.workspace", "warehouse", "vendor"],
      });

      if (!item || item.project.workspace?.id !== req.workspace!.id) {
        return res.status(404).json({ message: "Inventory item not found" });
      }

      const previousQuantity = item.quantity;

      if (itemName !== undefined) {
        const trimmedName = itemName.trim();
        if (!trimmedName) {
          return res.status(400).json({ message: "Item name is required" });
        }
        item.itemName = trimmedName;
      }
      if (category !== undefined) item.category = category;
      if (quantity !== undefined) item.quantity = Math.max(0, Math.round(quantity));
      if (unit !== undefined) item.unit = unit;
      if (status !== undefined) item.status = status;
      if (lastRestockedDate !== undefined) {
        // null (not undefined) so TypeORM actually issues SET lastRestockedDate = NULL
        // instead of silently excluding the column from the UPDATE.
        item.lastRestockedDate = lastRestockedDate
          ? new Date(lastRestockedDate)
          : (null as unknown as Date);
      }
      if (notes !== undefined) item.notes = notes;
      if (sku !== undefined) item.sku = sku;
      if (warehouseId !== undefined) {
        if (warehouseId === null) {
          item.warehouse = null as unknown as Warehouse;
        } else {
          const warehouse = await warehouseRepository.findOne({
            where: { id: warehouseId, workspace: { id: req.workspace!.id } },
          });
          if (warehouse) item.warehouse = warehouse;
        }
      }
      if (reservedQuantity !== undefined) item.reservedQuantity = Math.max(0, Math.round(reservedQuantity));
      if (incomingQuantity !== undefined) item.incomingQuantity = Math.max(0, Math.round(incomingQuantity));
      if (averageCost !== undefined) {
        item.averageCost = averageCost === null ? (null as unknown as number) : averageCost;
      }
      if (supplier !== undefined) item.supplier = supplier;
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
      if (imageUrl !== undefined) item.imageUrl = imageUrl;
      if (warrantyExpiryDate !== undefined) {
        item.warrantyExpiryDate = warrantyExpiryDate
          ? new Date(warrantyExpiryDate)
          : (null as unknown as Date);
      }

      const updatedBy = await userRepository.findOneBy({ id: req.user!.id });
      if (updatedBy) item.updatedBy = updatedBy;

      await itemRepository.save(item);

      if (quantity !== undefined && item.quantity !== previousQuantity) {
        await logTransaction(
          item,
          "adjustment",
          item.quantity - previousQuantity,
          item.quantity,
          "Manual edit",
          req.user!.id,
          req.workspace!.id,
        );
      }

      return res.status(200).json({ message: "Inventory item updated", item });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /projects/inventory/:itemId — admin-gated. */
  static deleteInventoryItem = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    try {
      const itemRepository = AppDataSource.getRepository(InventoryItem);
      const item = await itemRepository.findOne({
        where: { id: parseInt(itemId as string) },
        relations: ["project", "project.workspace"],
      });

      if (!item || item.project.workspace?.id !== req.workspace!.id) {
        return res.status(404).json({ message: "Inventory item not found" });
      }

      await itemRepository.remove(item);
      return res.status(200).json({ message: "Inventory item deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** Loads an item scoped to the caller's workspace, or null. Shared by all the detail-drawer endpoints below. */
  private static async loadOwnedItem(itemId: string, workspaceId: number) {
    const itemRepository = AppDataSource.getRepository(InventoryItem);
    const item = await itemRepository.findOne({
      where: { id: parseInt(itemId) },
      relations: ["project", "project.workspace", "warehouse", "vendor"],
    });
    if (!item || item.project.workspace?.id !== workspaceId) return null;
    return item;
  }

  /** POST /projects/inventory/:itemId/adjust — manual stock adjustment (writes a transaction). Admin-gated. */
  static adjustStock = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const { delta, reason }: AdjustInventoryStockDto = req.body;

    if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ message: "A non-zero numeric delta is required" });
    }

    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const itemRepository = AppDataSource.getRepository(InventoryItem);
      const previousQuantity = item.quantity;
      item.quantity = Math.max(0, Math.round(previousQuantity + delta));
      await itemRepository.save(item);

      await logTransaction(
        item,
        "adjustment",
        item.quantity - previousQuantity,
        item.quantity,
        reason,
        req.user!.id,
        req.workspace!.id,
      );

      return res.status(200).json({ message: "Stock adjusted", item });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /projects/inventory/:itemId/transfers — request a warehouse-to-warehouse transfer. Admin-gated. */
  static createTransfer = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const { fromWarehouseId, toWarehouseId, quantity, notes }: CreateStockTransferDto = req.body;

    if (!toWarehouseId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "toWarehouseId and a positive quantity are required" });
    }

    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const warehouseRepository = AppDataSource.getRepository(Warehouse);
      const toWarehouse = await warehouseRepository.findOne({
        where: { id: toWarehouseId, workspace: { id: req.workspace!.id } },
      });
      if (!toWarehouse) return res.status(404).json({ message: "Destination warehouse not found" });

      const fromWarehouse = fromWarehouseId
        ? await warehouseRepository.findOne({ where: { id: fromWarehouseId, workspace: { id: req.workspace!.id } } })
        : null;

      const userRepository = AppDataSource.getRepository(User);
      const requestedBy = await userRepository.findOneBy({ id: req.user!.id });

      const transferRepository = AppDataSource.getRepository(StockTransfer);
      const transfer = transferRepository.create({
        inventoryItem: item,
        toWarehouse,
        quantity: Math.round(quantity),
        ...(fromWarehouse ? { fromWarehouse } : {}),
        ...(notes ? { notes } : {}),
        ...(requestedBy ? { requestedBy } : {}),
      });
      await transferRepository.save(transfer);

      return res.status(201).json({ message: "Transfer created", transfer });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** PUT /projects/inventory/:itemId/transfers/:transferId — advance a transfer's status. Admin-gated. */
  static updateTransferStatus = async (req: AuthRequest, res: Response) => {
    const { itemId, transferId } = req.params;
    const { status }: UpdateStockTransferDto = req.body;

    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const transferRepository = AppDataSource.getRepository(StockTransfer);
      const transfer = await transferRepository.findOne({
        where: { id: parseInt(transferId as string), inventoryItem: { id: item.id } },
        relations: ["fromWarehouse", "toWarehouse"],
      });
      if (!transfer) return res.status(404).json({ message: "Transfer not found" });

      const wasCompleted = transfer.status === "completed";
      transfer.status = status;
      if (status === "completed" && !wasCompleted) {
        transfer.completedAt = new Date();
        // Single-primary-warehouse model: completing a transfer relocates the
        // item's primary location; total on-hand quantity is unaffected, so
        // both audit rows below net to zero but keep the move visible in history.
        const itemRepository = AppDataSource.getRepository(InventoryItem);
        item.warehouse = transfer.toWarehouse;
        await itemRepository.save(item);
        await logTransaction(item, "transfer_out", -transfer.quantity, item.quantity, `Transfer #${transfer.id} out`, req.user!.id, req.workspace!.id);
        await logTransaction(item, "transfer_in", transfer.quantity, item.quantity, `Transfer #${transfer.id} in`, req.user!.id, req.workspace!.id);
      }
      await transferRepository.save(transfer);

      return res.status(200).json({ message: "Transfer updated", transfer });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /projects/inventory/:itemId/batches — add a batch/lot. Admin-gated. */
  static addBatch = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const { batchNumber, quantity, manufactureDate, expiryDate }: AddInventoryBatchDto = req.body;

    if (!batchNumber || !batchNumber.trim()) {
      return res.status(400).json({ message: "Batch number is required" });
    }

    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const batchRepository = AppDataSource.getRepository(InventoryBatch);
      const batch = batchRepository.create({
        batchNumber: batchNumber.trim(),
        quantity: quantity && quantity > 0 ? Math.round(quantity) : 0,
        inventoryItem: item,
        ...(manufactureDate ? { manufactureDate: new Date(manufactureDate) } : {}),
        ...(expiryDate ? { expiryDate: new Date(expiryDate) } : {}),
      });
      await batchRepository.save(batch);

      return res.status(201).json({ message: "Batch added", batch });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /projects/inventory/:itemId/batches/:batchId — admin-gated. */
  static deleteBatch = async (req: AuthRequest, res: Response) => {
    const { itemId, batchId } = req.params;
    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const batchRepository = AppDataSource.getRepository(InventoryBatch);
      const batch = await batchRepository.findOne({
        where: { id: parseInt(batchId as string), inventoryItem: { id: item.id } },
      });
      if (!batch) return res.status(404).json({ message: "Batch not found" });

      await batchRepository.remove(batch);
      return res.status(200).json({ message: "Batch deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /projects/inventory/:itemId/serials — add a serial number. Admin-gated. */
  static addSerial = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const { serialNumber, status, warrantyExpiryDate, notes }: AddInventorySerialDto = req.body;

    if (!serialNumber || !serialNumber.trim()) {
      return res.status(400).json({ message: "Serial number is required" });
    }

    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const serialRepository = AppDataSource.getRepository(InventorySerial);
      const serial = serialRepository.create({
        serialNumber: serialNumber.trim(),
        inventoryItem: item,
        ...(status ? { status } : {}),
        ...(warrantyExpiryDate ? { warrantyExpiryDate: new Date(warrantyExpiryDate) } : {}),
        ...(notes ? { notes } : {}),
      });
      await serialRepository.save(serial);

      return res.status(201).json({ message: "Serial added", serial });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /projects/inventory/:itemId/serials/:serialId — admin-gated. */
  static deleteSerial = async (req: AuthRequest, res: Response) => {
    const { itemId, serialId } = req.params;
    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const serialRepository = AppDataSource.getRepository(InventorySerial);
      const serial = await serialRepository.findOne({
        where: { id: parseInt(serialId as string), inventoryItem: { id: item.id } },
      });
      if (!serial) return res.status(404).json({ message: "Serial not found" });

      await serialRepository.remove(serial);
      return res.status(200).json({ message: "Serial deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /projects/inventory/:itemId/attachments — upload a document. Admin-gated. Expects multer single("file"). */
  static addAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });

    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const userRepository = AppDataSource.getRepository(User);
      const uploadedBy = await userRepository.findOneBy({ id: req.user!.id });

      const attachmentRepository = AppDataSource.getRepository(InventoryAttachment);
      const attachment = attachmentRepository.create({
        fileName: file.originalname,
        filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
        inventoryItem: item,
        ...(uploadedBy ? { uploadedBy } : {}),
      });
      await attachmentRepository.save(attachment);

      return res.status(201).json({ message: "Attachment uploaded", attachment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /projects/inventory/:itemId/attachments/:attachmentId — admin-gated. */
  static deleteAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId, attachmentId } = req.params;
    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const attachmentRepository = AppDataSource.getRepository(InventoryAttachment);
      const attachment = await attachmentRepository.findOne({
        where: { id: parseInt(attachmentId as string), inventoryItem: { id: item.id } },
      });
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });

      await attachmentRepository.remove(attachment);
      return res.status(200).json({ message: "Attachment deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /**
   * GET /projects/inventory/:itemId/detail — everything the drawer needs in one
   * round-trip: batches, serials, recent transactions, transfers, attachments,
   * purchase history (matching ProcurementItem rows) and project allocation
   * (other InventoryItem rows with the same name across the workspace).
   */
  static getInventoryItemDetail = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    try {
      const item = await InventoryController.loadOwnedItem(itemId as string, req.workspace!.id);
      if (!item) return res.status(404).json({ message: "Inventory item not found" });

      const [batches, serials, transactions, transfers, attachments, purchaseHistory, projectAllocation] =
        await Promise.all([
          AppDataSource.getRepository(InventoryBatch).find({
            where: { inventoryItem: { id: item.id } },
            order: { createdAt: "DESC" },
          }),
          AppDataSource.getRepository(InventorySerial).find({
            where: { inventoryItem: { id: item.id } },
            order: { createdAt: "DESC" },
          }),
          AppDataSource.getRepository(InventoryTransaction).find({
            where: { inventoryItem: { id: item.id } },
            relations: ["performedBy"],
            order: { createdAt: "DESC" },
            take: 50,
          }),
          AppDataSource.getRepository(StockTransfer).find({
            where: { inventoryItem: { id: item.id } },
            relations: ["fromWarehouse", "toWarehouse", "requestedBy"],
            order: { createdAt: "DESC" },
          }),
          AppDataSource.getRepository(InventoryAttachment).find({
            where: { inventoryItem: { id: item.id } },
            relations: ["uploadedBy"],
            order: { createdAt: "DESC" },
          }),
          AppDataSource.getRepository(ProcurementItem).find({
            where: { itemName: item.itemName, project: { workspace: { id: req.workspace!.id } } },
            relations: ["project"],
            order: { createdAt: "DESC" },
            take: 20,
          }),
          AppDataSource.getRepository(InventoryItem).find({
            where: { itemName: item.itemName, project: { workspace: { id: req.workspace!.id } } },
            relations: ["project"],
            order: { createdAt: "DESC" },
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /workspace/warehouses — list warehouses for pickers/filters. */
  static getWorkspaceWarehouses = async (req: AuthRequest, res: Response) => {
    try {
      const warehouseRepository = AppDataSource.getRepository(Warehouse);
      const warehouses = await warehouseRepository.find({
        where: { workspace: { id: req.workspace!.id } },
        order: { name: "ASC" },
      });
      return res.status(200).json({ warehouses });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /workspace/inventory/transfers — pending/in-transit transfers across the workspace, for the KPI strip. */
  static getWorkspacePendingTransfers = async (req: AuthRequest, res: Response) => {
    try {
      const transferRepository = AppDataSource.getRepository(StockTransfer);
      const transfers = await transferRepository
        .createQueryBuilder("transfer")
        .leftJoinAndSelect("transfer.inventoryItem", "inventoryItem")
        .leftJoinAndSelect("inventoryItem.project", "project")
        .leftJoinAndSelect("transfer.fromWarehouse", "fromWarehouse")
        .leftJoinAndSelect("transfer.toWarehouse", "toWarehouse")
        .where("project.workspaceId = :workspaceId", { workspaceId: req.workspace!.id })
        .andWhere("transfer.status IN (:...statuses)", { statuses: ["pending", "in_transit"] })
        .orderBy("transfer.createdAt", "DESC")
        .getMany();

      return res.status(200).json({ transfers });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /workspace/inventory/transactions — recent audit-log entries across the workspace, for the sidebar widget. */
  static getWorkspaceInventoryTransactions = async (req: AuthRequest, res: Response) => {
    try {
      const txRepository = AppDataSource.getRepository(InventoryTransaction);
      const transactions = await txRepository.find({
        where: { workspace: { id: req.workspace!.id } },
        relations: ["performedBy", "inventoryItem"],
        order: { createdAt: "DESC" },
        take: 20,
      });
      return res.status(200).json({ transactions });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /workspace/warehouses — create a warehouse. Admin-gated. */
  static createWarehouse = async (req: AuthRequest, res: Response) => {
    const { name, code, location, capacity }: AddWarehouseDto = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Warehouse name is required" });
    }
    try {
      const warehouseRepository = AppDataSource.getRepository(Warehouse);
      const warehouse = warehouseRepository.create({
        name: name.trim(),
        capacity: capacity && capacity > 0 ? Math.round(capacity) : 0,
        workspace: req.workspace!,
        ...(code ? { code } : {}),
        ...(location ? { location } : {}),
      });
      await warehouseRepository.save(warehouse);
      return res.status(201).json({ message: "Warehouse created", warehouse });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /workspace/vendors — list vendors for pickers/filters. */
  static getWorkspaceVendors = async (req: AuthRequest, res: Response) => {
    try {
      const vendorRepository = AppDataSource.getRepository(Vendor);
      const vendors = await vendorRepository.find({
        where: { workspace: { id: req.workspace!.id } },
        order: { name: "ASC" },
      });
      return res.status(200).json({ vendors });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /workspace/vendors — create a vendor. Admin-gated. */
  static createVendor = async (req: AuthRequest, res: Response) => {
    const { name, code, location, rating, contractExpiryDate }: AddVendorDto = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Vendor name is required" });
    }
    try {
      const vendorRepository = AppDataSource.getRepository(Vendor);
      const vendor = vendorRepository.create({
        name: name.trim(),
        workspace: req.workspace!,
        ...(code ? { code } : {}),
        ...(location ? { location } : {}),
        ...(rating !== undefined ? { rating } : {}),
        ...(contractExpiryDate ? { contractExpiryDate: new Date(contractExpiryDate) } : {}),
      });
      await vendorRepository.save(vendor);
      return res.status(201).json({ message: "Vendor created", vendor });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** PUT /workspace/vendors/:vendorId — update a vendor. Admin-gated. */
  static updateVendor = async (req: AuthRequest, res: Response) => {
    const { vendorId } = req.params;
    const { name, code, location, rating, contractExpiryDate }: UpdateVendorDto = req.body;
    try {
      const vendorRepository = AppDataSource.getRepository(Vendor);
      const vendor = await vendorRepository.findOne({
        where: { id: parseInt(vendorId as string), workspace: { id: req.workspace!.id } },
      });
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });

      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) return res.status(400).json({ message: "Vendor name is required" });
        vendor.name = trimmedName;
      }
      if (code !== undefined) vendor.code = code;
      if (location !== undefined) vendor.location = location;
      if (rating !== undefined) {
        vendor.rating = rating === null ? (null as unknown as number) : rating;
      }
      if (contractExpiryDate !== undefined) {
        vendor.contractExpiryDate = contractExpiryDate
          ? new Date(contractExpiryDate)
          : (null as unknown as Date);
      }

      await vendorRepository.save(vendor);
      return res.status(200).json({ message: "Vendor updated", vendor });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
