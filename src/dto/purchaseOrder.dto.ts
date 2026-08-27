import { PurchaseOrderStatus, PurchaseType } from "../types/domain";

/** One line item on a new Purchase Order, submitted directly (no Purchase Request involved). */
export interface CreatePurchaseOrderItemDto {
  itemName: string;
  itemId?: number | null;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  description?: string | null;
}

/** Body shape for POST /projects/:projectId/purchase-orders and POST /purchase-orders. Items
 * are no longer required up front — they're added one at a time afterward from the Overview tab
 * (see AddPurchaseOrderItemDto). `projectId` is only read on the project-less /purchase-orders
 * route (the project-scoped route takes it from the URL instead) — a PO can be created without
 * a project at all. */
export interface CreatePurchaseOrderDto {
  vendorId?: number | null;
  projectId?: number | null;
  items?: CreatePurchaseOrderItemDto[];
}

/** Body shape for POST /purchase-orders/:id/items — adding one line item to an existing PO. */
export interface AddPurchaseOrderItemDto {
  itemName: string;
  itemId?: number | null;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  description?: string | null;
}

/** Body shape for PUT /purchase-orders/:id/items/:itemId — full edit of one existing line item
 * (distinct from UpdatePurchaseOrderItemDto below, which only patches hsnCode inline with the
 * header form). */
export interface EditPurchaseOrderItemDto {
  itemName: string;
  itemId?: number | null;
  quantity: number;
  unit?: string | null;
  unitPrice?: number | null;
  description?: string | null;
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
