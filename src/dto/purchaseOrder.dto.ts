import { PurchaseOrderStatus, PurchaseType } from "../types/domain";

/** Per-item patch accepted alongside the header fields below — the only editable field on an existing PurchaseOrderItem (everything else is a snapshot fixed at generate-po time). */
export interface UpdatePurchaseOrderItemDto {
  id: number;
  hsnCode?: string | null;
}

/** Body shape for PUT /purchase-orders/:id — POs are only ever created via POST /purchase-requests/:id/generate-po, never directly. */
export interface UpdatePurchaseOrderDto {
  deliveryAddress?: string;
  paymentTerms?: string;
  deliveryDate?: string | null;
  incoterms?: string;
  taxPercent?: number | null;
  terms?: string;
  shippingTerms?: string;
  deliveryPeriod?: string;
  finalDestination?: string;
  purchaseType?: PurchaseType;
  status?: PurchaseOrderStatus;
  items?: UpdatePurchaseOrderItemDto[];
}
