/** Body shape for POST /organization/warehouses. */
export interface AddWarehouseDto {
  name: string;
  code?: string;
  location?: string;
  capacity?: number;
}
