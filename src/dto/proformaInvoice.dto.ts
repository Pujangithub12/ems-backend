import { ProformaInvoiceStatus } from "../types/domain";

export interface ProformaInvoiceItemInput {
  itemName: string;
  itemId?: number;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  hsnCode?: string;
  taxable?: boolean;
}

/** Body shape for POST /purchase-orders/:id/proforma-invoices and POST /workspace/proforma-invoices (PO-less). */
export interface AddProformaInvoiceDto {
  piNumber?: string;
  piDate?: string;
  currency?: string;
  exchangeRate?: number;
  paymentTerms?: string;
  validityDate?: string;
  taxPercent?: number;
  customerPan?: string;
  customerName?: string;
  customerContactPerson?: string;
  customerAddress?: string;
  customerEmail?: string;
  customerContact?: string;
  vendorPan?: string;
  /** Legacy: link an existing Vendor. The VENDOR box on the PDF is now this app's own
   * organization — vendorName/vendorContactPerson/... below override its details per invoice. */
  vendorId?: number;
  vendorName?: string;
  vendorContactPerson?: string;
  vendorAddress?: string;
  vendorContact?: string;
  vendorEmail?: string;
  bankBeneficiaryName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankSwiftCode?: string;
  bankAddress?: string;
  deliveryTerms?: string;
  placeOfLoading?: string;
  placeOfDischarge?: string;
  modeOfShipment?: string;
  notes?: string;
  items?: ProformaInvoiceItemInput[];
}

/** Body shape for PUT /proforma-invoices/:id. */
export interface UpdateProformaInvoiceDto {
  piNumber?: string | null;
  piDate?: string | null;
  currency?: string | null;
  exchangeRate?: number;
  paymentTerms?: string | null;
  validityDate?: string | null;
  status?: ProformaInvoiceStatus;
  taxPercent?: number | null;
  customerPan?: string | null;
  customerName?: string | null;
  customerContactPerson?: string | null;
  customerAddress?: string | null;
  customerEmail?: string | null;
  customerContact?: string | null;
  vendorPan?: string | null;
  vendorId?: number | null;
  vendorName?: string | null;
  vendorContactPerson?: string | null;
  vendorAddress?: string | null;
  vendorContact?: string | null;
  vendorEmail?: string | null;
  bankBeneficiaryName?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankSwiftCode?: string | null;
  bankAddress?: string | null;
  deliveryTerms?: string | null;
  placeOfLoading?: string | null;
  placeOfDischarge?: string | null;
  modeOfShipment?: string | null;
  notes?: string | null;
  items?: ProformaInvoiceItemInput[];
}
