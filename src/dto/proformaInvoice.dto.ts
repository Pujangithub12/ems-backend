import { ProformaInvoiceStatus } from "../types/domain";

export interface ProformaInvoiceItemInput {
  itemName: string;
  itemId?: number;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
}

/** Body shape for POST /purchase-orders/:id/proforma-invoices. */
export interface AddProformaInvoiceDto {
  piNumber?: string;
  piDate?: string;
  currency?: string;
  exchangeRate?: number;
  paymentTerms?: string;
  validityDate?: string;
  items?: ProformaInvoiceItemInput[];
}

/** Body shape for PUT /proforma-invoices/:id. */
export interface UpdateProformaInvoiceDto {
  piNumber?: string;
  piDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  paymentTerms?: string;
  validityDate?: string | null;
  status?: ProformaInvoiceStatus;
  items?: ProformaInvoiceItemInput[];
}
