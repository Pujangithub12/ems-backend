export interface QuotationItemInput {
  itemName: string;
  description?: string;
  quantity?: number;
  unit?: string;
  rate?: number;
}

/** Body shape for POST /workspace/quotations. */
export interface AddQuotationDto {
  quotationNumber?: string;
  quotationDate?: string;
  title?: string;
  currency?: string;
  fromPan?: string;
  regNo?: string;
  customerName?: string;
  customerAddress?: string;
  customerContact?: string;
  customerEmail?: string;
  customerPan?: string;
  priceBasis?: string;
  deliveryPeriod?: string;
  paymentTerms?: string;
  validityPeriod?: string;
  taxPercent?: number;
  signatoryName?: string;
  signatoryDesignation?: string;
  items?: QuotationItemInput[];
}

/** Body shape for PUT /quotations/:id — every field but `items` may be sent as `null` to clear a
 * saved value (omitting a field entirely, i.e. `undefined`, leaves it untouched). */
export interface UpdateQuotationDto {
  quotationNumber?: string | null;
  quotationDate?: string | null;
  title?: string | null;
  currency?: string | null;
  fromPan?: string | null;
  regNo?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerContact?: string | null;
  customerEmail?: string | null;
  customerPan?: string | null;
  priceBasis?: string | null;
  deliveryPeriod?: string | null;
  paymentTerms?: string | null;
  validityPeriod?: string | null;
  taxPercent?: number | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  items?: QuotationItemInput[];
}
