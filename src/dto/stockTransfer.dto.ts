import { StockTransferStatus } from "../entities/StockTransfer";

/** Body shape for POST /projects/inventory/:itemId/transfers. */
export interface CreateStockTransferDto {
  fromWarehouseId?: number;
  toWarehouseId: number;
  quantity: number;
  notes?: string;
}

/** Body shape for PUT /projects/inventory/:itemId/transfers/:transferId. */
export interface UpdateStockTransferDto {
  status: StockTransferStatus;
}
