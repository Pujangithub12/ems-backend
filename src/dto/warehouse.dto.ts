/** Body shape for POST /workspace/warehouses. */
export interface AddWarehouseDto {
  name: string;
  code?: string;
  location?: string;
  capacity?: number;
}
