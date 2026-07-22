import { ProcurementStatus, ProcurementCategory } from "../entities/ProcurementItem";

/** Body shape for POST /projects/:projectId/procurement. */
export interface AddProcurementItemDto {
  itemName: string;
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
