/** Body shape for POST /purchase-orders/:id/payments — logs one installment paid against a PO. */
export interface AddPurchaseOrderPaymentDto {
  amount: number;
  paidDate: string;
  /** NPR per 1 unit of the row's currency, at the time of this payment — only meaningful for a
   * non-NPR row; omit/null for NPR. */
  exchangeRate?: number | null;
  reference?: string | null;
  notes?: string | null;
}

/** Body shape for POST /workspace/finance/manual-records/:id/payments — same shape, logged against a FinanceManualRecord instead of a PO. */
export type AddManualRecordPaymentDto = AddPurchaseOrderPaymentDto;

/** Body shape for creating/updating a manually-entered Finance ledger row (not derived from a real PurchaseOrder). */
export interface SaveFinanceManualRecordDto {
  vendorName: string;
  itemName: string;
  referenceNumber?: string | null;
  itemValue: number;
  paymentTerms?: string | null;
  vendorId?: number | null;
  /** "NPR" | "INR" | "USD" | "RMB" — falls back to "NPR" when unset. */
  currency?: string;
}

/** Body shape for editing a full row on the Finance cost-breakdown page — same fields whether
 * the row is a PO line item (PUT .../purchase-orders/:poId/items/:itemId) or a manual record's
 * single line (PUT .../manual-records/:id/breakdown). */
export interface EditCostBreakdownRowDto {
  itemName: string;
  majorCost: number;
  freight: number;
  lcNumber?: string | null;
  lcAmount: number;
  lcCharge: number;
  lcCommission: number;
  vat: number;
  importDuties: number;
  insurance: number;
  /** Manually entered directly in NPR (not this row's own currency) — how much VAT/tax is
   * refundable on this row. */
  refundableAmount: number;
  /** How much VAT has actually been refunded so far, also in NPR. */
  refundedAmount: number;
  remarks?: string | null;
}
