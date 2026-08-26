import { PurchaseOrderStatus, PurchaseType } from "../types/domain";

/** One line item on a new Purchase Order, submitted directly (no Purchase Request involved). */
export interface CreatePurchaseOrderItemDto {
  itemName: string;
  itemId?: number | null;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  notes?: string | null;
}

/** Body shape for POST /projects/:projectId/purchase-orders. */
export interface CreatePurchaseOrderDto {
  vendorId?: number | null;
  items: CreatePurchaseOrderItemDto[];
}

/** Per-item patch accepted alongside the header fields below — the only editable field on an existing PurchaseOrderItem (everything else is a snapshot fixed at creation time). */
export interface UpdatePurchaseOrderItemDto {
  id: number;
  hsnCode?: string | null;
}

/** Body shape for PUT /purchase-orders/:id. */
export interface UpdatePurchaseOrderDto {
  /** Auto-assigned at creation time (see PurchaseOrderController.createPurchaseOrder) but user-editable afterward — see the uniqueness check in PurchaseOrderController.updatePurchaseOrder. */
  poNumber?: string;
  paymentTerms?: string;
  incoterms?: string;
  taxPercent?: number | null;
  terms?: string;
  deliveryPeriod?: string;
  finalDestination?: string;
  customerContactPerson?: string;
  currency?: string;
  purchaseType?: PurchaseType;
  status?: PurchaseOrderStatus;
  items?: UpdatePurchaseOrderItemDto[];
}

/** Body shape for POST /purchase-orders/:id/approval. */
export interface DecidePurchaseOrderApprovalDto {
  decision: "approved" | "rejected";
}
