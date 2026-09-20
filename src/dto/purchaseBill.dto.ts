export type PurchasePaymentMode = "cash" | "credit";
export type PurchaseBillStatus = "pending" | "partial" | "paid";

/** Body shape for POST /purchase-bills and PUT /purchase-bills/:id, and each
 * row of POST /purchase-bills/import. Amount / VAT amount / total / payment
 * status are never sent or stored — derived from quantity, rate, vatRate and
 * actualAmount. `date` is an AD ISO date (YYYY-MM-DD); the frontend converts
 * from the Bikram Sambat date the user sees. */
export interface SavePurchaseBillDto {
  projectId?: number;
  date: string;
  billNo?: string | null;
  challanNo?: string | null;
  vendorId?: number | null;
  vendorName: string;
  material: string;
  unit?: string | null;
  quantity: number;
  rate: number;
  vatRate?: number | null;
  actualAmount?: number | null;
  vehicleNo?: string | null;
  paymentMode?: PurchasePaymentMode | null;
  paidBy?: string | null;
  billStatus?: PurchaseBillStatus | null;
  site?: string | null;
  remarks?: string | null;
}

export interface ImportPurchaseBillsDto {
  projectId: number;
  rows: SavePurchaseBillDto[];
}
