import { InventorySerialStatus } from "../entities/InventorySerial";

/** Body shape for POST /projects/inventory/:itemId/serials. */
export interface AddInventorySerialDto {
  serialNumber: string;
  status?: InventorySerialStatus;
  warrantyExpiryDate?: string;
  notes?: string;
}
