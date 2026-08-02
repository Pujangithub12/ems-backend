import { GoodsReceiptStatus } from "../types/domain";

export interface GoodsReceiptItemInput {
  purchaseOrderItemId: number;
  receivedQuantity: number;
  damagedQuantity?: number;
}

/** Body shape for POST /purchase-orders/:id/goods-receipts. */
export interface AddGoodsReceiptDto {
  warehouseId?: number;
  inspectionResult?: string;
  items: GoodsReceiptItemInput[];
}

/** Body shape for PUT /goods-receipts/:id/status — accepting/partially-accepting is what triggers the inventory increment (see GoodsReceiptController). */
export interface UpdateGoodsReceiptStatusDto {
  status: GoodsReceiptStatus;
  inspectionResult?: string;
}
