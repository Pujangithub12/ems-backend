// Plain type aliases previously declared inside TypeORM entity files, not
// tied to the ORM. Relocated here since src/entities/ no longer exists.

export type FileAccessLevel = "none" | "read" | "write";
export type FileGranteeType = "user" | "role";

export type ProcurementStatus = "pending" | "approved" | "ordered" | "delivered";
export type ProcurementCategory = "hardware" | "software" | "service";

export type ReportActivityAction = "viewed" | "exported";

/** Tracks a single progress update entry inside SubTask.history (JSON-in-text column). */
export type SubTaskHistoryItem = {
  id: string;
  date: string;
  title: string;
  progress: number;
  authorId: number;
  authorName: string;
};

export type InventoryCategory = "hardware" | "software" | "service";
export type InventoryStatus = "in_stock" | "low_stock" | "out_of_stock";

export type InventoryTransactionType =
  | "receipt"
  | "issue"
  | "adjustment"
  | "transfer_in"
  | "transfer_out";

export type InventorySerialStatus = "available" | "allocated" | "damaged" | "sold";

export type StockTransferStatus = "pending" | "in_transit" | "completed" | "cancelled";

// Procurement pipeline v2: Purchase Order -> Proforma Invoice ->
// Shipment/Insurance/Customs -> Goods Receipt.
export type PurchaseOrderStatus = "created" | "sent" | "accepted" | "cancelled" | "completed";
export type PurchaseOrderApprovalStatus = "pending_approval" | "approved" | "rejected";
export type PurchaseType = "local" | "international";

export type ProformaInvoiceStatus = "waiting" | "approved" | "rejected";

export type ShipmentTransportMode = "road" | "sea" | "air";
export type ShipmentStatus = "booked" | "in_transit" | "arrived" | "delivered";

export type CustomsDocumentType =
  | "bill_of_lading"
  | "commercial_invoice"
  | "packing_list"
  | "certificate_of_origin"
  | "insurance_certificate"
  | "other";

export type GoodsReceiptStatus = "pending_inspection" | "accepted" | "partially_accepted" | "rejected";
