/** Body shape for POST /organization/items. */
export interface AddCatalogItemDto {
  name: string;
  code?: string;
  description?: string;
}

/** Body shape for PUT /organization/items/:itemId. */
export interface UpdateCatalogItemDto {
  name?: string;
  code?: string;
  description?: string;
}
