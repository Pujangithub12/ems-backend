/** Body shape for POST /workspace/vendors. */
export interface AddVendorDto {
  name: string;
  code?: string;
  location?: string;
  contact?: string;
  contractExpiryDate?: string;
}

/** Body shape for PUT /workspace/vendors/:vendorId. */
export interface UpdateVendorDto {
  name?: string;
  code?: string;
  location?: string;
  contact?: string;
  contractExpiryDate?: string | null;
}
