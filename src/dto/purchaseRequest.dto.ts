import { PurchaseRequestPriority, PurchaseRequestStatus } from "../types/domain";

export interface PurchaseRequestItemInput {
  itemName?: string;
  /** References CatalogItem — when set, itemName is derived from it server-side. */
  itemId?: number;
  quantity?: number;
  unit?: string;
  estimatedPrice?: number;
  notes?: string;
}

/** Body shape for POST /projects/:projectId/purchase-requests. */
export interface AddPurchaseRequestDto {
  department?: string;
  priority?: PurchaseRequestPriority;
  reason?: string;
  items: PurchaseRequestItemInput[];
}

/** Body shape for PUT /purchase-requests/:id — only allowed while status is "draft". */
export interface UpdatePurchaseRequestDto {
  department?: string;
  priority?: PurchaseRequestPriority;
  reason?: string;
  items?: PurchaseRequestItemInput[];
}

/** Body shape for POST /purchase-requests/:id/status — submit/approve/reject transitions. "converted_to_po" is set only by the generate-po action, not directly. */
export interface ChangePurchaseRequestStatusDto {
  status: PurchaseRequestStatus;
  notes?: string;
}

/** Body shape for POST /purchase-requests/:id/vendor-quotes. */
export interface AddVendorQuoteDto {
  vendorId: number;
  price: number;
  notes?: string;
}

/** Body shape for PUT /purchase-requests/:id/vendor-quotes/:quoteId. */
export interface UpdateVendorQuoteDto {
  vendorId?: number;
  price?: number;
  notes?: string;
}
