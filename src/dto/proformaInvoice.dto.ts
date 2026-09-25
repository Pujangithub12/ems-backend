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
  piNumber?: string;
  piDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  paymentTerms?: string;
  validityDate?: string | null;
  status?: ProformaInvoiceStatus;
  taxPercent?: number | null;
  customerPan?: string;
  customerName?: string;
  customerContactPerson?: string;
  customerAddress?: string;
  customerEmail?: string;
  customerContact?: string;
  vendorPan?: string;
  vendorId?: number | null;
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
