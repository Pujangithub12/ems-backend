import type { CustomTableColumnDataType } from "./customTableCells.dto";

/** Body shape for POST /materials?projectId and PUT /materials/:id — the
 * material master row (name/category/unit/reorder threshold/default vendor).
 * Current stock/value/status are never sent/stored — always computed live
 * from MaterialTransaction rows (see MaterialController.list). */
export interface SaveMaterialDto {
  name: string;
  code?: string | null;
  category?: string | null;
  unit: string;
  minStock?: number | null;
  vendorId?: number | null;
  /** Raw values keyed by MaterialField id (string) — coerced/validated
   * against this project's field definitions in the controller before
   * saving (see coerceRowValues in customTableCells.dto.ts). */
  customFields?: Record<string, unknown>;
}

/** Body shape for POST /material-fields?projectId and PUT /material-fields/:id. */
export interface SaveMaterialFieldDto {
  name: string;
  dataType: CustomTableColumnDataType;
}

export type MaterialTransactionType = "received" | "used";

/** Body shape for POST /materials/:id/transactions — one receive-or-use
 * event. `vendorId`/`unitPrice` are meaningful only for "received";
 * `workArea`/`issuedTo` only for "used" — the controller doesn't enforce
 * that split strictly (a stray value on the "wrong" type is just ignored by
 * the frontend), it only enforces the shared required fields. */
export interface AddMaterialTransactionDto {
  type: MaterialTransactionType;
  quantity: number;
  date: string; // YYYY-MM-DD
  vendorId?: number | null;
  unitPrice?: number | null;
  workArea?: string | null;
  issuedTo?: string | null;
  reference?: string | null;
  remarks?: string | null;
}
