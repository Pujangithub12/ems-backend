/** Body shape for creating/updating a Shipment Tracking record (Finance page's second tab) —
 * every field is optional, since this is a freeform operational log rather than a strictly
 * validated business record. */
export interface SaveShipmentTrackingRecordDto {
  blNumber?: string | null;
  carrierName?: string | null;
  /** "YYYY-MM-DD" */
  dispatchDate?: string | null;
  /** "YYYY-MM-DD" */
  eta?: string | null;
  pol?: string | null;
  pod?: string | null;
  containerType?: string | null;
  containerCount?: number | null;
  dispatchedFrom?: string | null;
  documentStatus?: string | null;
  remarks?: string | null;
}
