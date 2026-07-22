import { InventoryCategory, InventoryStatus } from "../entities/InventoryItem";

/** Body shape for POST /projects/:projectId/inventory. */
export interface AddInventoryItemDto {
  itemName: string;
  category?: InventoryCategory;
  quantity?: number;
  unit?: string;
  status?: InventoryStatus;
  lastRestockedDate?: string;
  notes?: string;
  sku?: string;
  warehouseId?: number;
  reservedQuantity?: number;
  incomingQuantity?: number;
  averageCost?: number;
  supplier?: string;
  vendorId?: number;
  imageUrl?: string;
  warrantyExpiryDate?: string;
}

/** Body shape for PUT /projects/inventory/:itemId. */
export interface UpdateInventoryItemDto {
  itemName?: string;
  category?: InventoryCategory;
  quantity?: number;
  unit?: string;
  status?: InventoryStatus;
  lastRestockedDate?: string | null;
  notes?: string;
  sku?: string;
  warehouseId?: number | null;
  reservedQuantity?: number;
  incomingQuantity?: number;
  averageCost?: number | null;
  supplier?: string;
  vendorId?: number | null;
  imageUrl?: string;
  warrantyExpiryDate?: string | null;
}

/** Body shape for POST /projects/inventory/:itemId/adjust. */
export interface AdjustInventoryStockDto {
  delta: number;
  reason?: string;
}
