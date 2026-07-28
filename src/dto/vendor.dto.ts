/** Body shape for POST /organization/vendors. */
export interface AddVendorDto {
  name: string;
  code?: string;
  location?: string;
  contact?: string;
  contractExpiryDate?: string;
  /** Vendor's contact person name, and full postal address/email — used on generated Purchase Order PDFs. */
  contactPerson?: string;
  address?: string;
  email?: string;
}

/** Body shape for PUT /organization/vendors/:vendorId. */
export interface UpdateVendorDto {
  name?: string;
  code?: string;
  location?: string;
  contact?: string;
  contractExpiryDate?: string | null;
  contactPerson?: string;
  address?: string;
  email?: string;
}
