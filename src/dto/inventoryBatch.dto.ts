/** Body shape for POST /projects/inventory/:itemId/batches. */
export interface AddInventoryBatchDto {
  batchNumber: string;
  quantity?: number;
  manufactureDate?: string;
  expiryDate?: string;
}
