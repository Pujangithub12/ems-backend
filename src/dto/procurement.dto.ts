import { ProcurementStatus, ProcurementCategory } from "../entities/ProcurementItem";

/** Body shape for POST /projects/:projectId/procurement. */
export interface AddProcurementItemDto {
  itemName?: string;
  /** References CatalogItem — when set, itemName is derived from it server-side instead of trusting the freeform field above. */
  itemId?: number;
  category?: ProcurementCategory;
  quantity?: number;
  estimatedCost?: number;
  unitCost?: number;
  vendorName?: string;
  vendorId?: number;
  neededByDate?: string;
  notes?: string;
}

/** Body shape for PUT /projects/procurement/:itemId. */
export interface UpdateProcurementItemDto {
  itemName?: string;
  /** References CatalogItem — when set (non-null), itemName is overwritten from it server-side. Pass null to detach. */
  itemId?: number | null;
  category?: ProcurementCategory;
  quantity?: number;
  estimatedCost?: number | null;
  unitCost?: number | null;
  vendorName?: string;
  vendorId?: number | null;
  neededByDate?: string | null;
  status?: ProcurementStatus;
  notes?: string;
}
