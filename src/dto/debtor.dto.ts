/** Body shape for creating/updating a debtor record (money a customer owes us). */
export interface SaveDebtorRecordDto {
  debtorName: string;
  itemName: string;
  referenceNumber?: string | null;
  lcNumber?: string | null;
  amountDue: number;
  claimAmount?: number;
  paymentTerms?: string | null;
  projectId?: number | null;
  /** "NPR" | "INR" | "USD" | "RMB" — falls back to "NPR" when unset. */
  currency?: string;
}

/** Body shape for logging one installment received from a debtor. */
export interface AddDebtorPaymentDto {
  amount: number;
  receivedDate: string;
  reference?: string | null;
  notes?: string | null;
}

/** Body shape for one claim / reimbursement-of-expense line on a debtor's detail page. */
export interface SaveDebtorClaimDto {
  paymentDate?: string | null;
  purpose?: string | null;
  commercialInvoiceNo?: string | null;
  claimReceived: number;
  reimbursementPurpose?: string | null;
  reimbursementAmount: number;
  reimbursementReceived: number;
}
