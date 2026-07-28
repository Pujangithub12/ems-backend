import { ShipmentTransportMode, ShipmentStatus } from "../types/domain";

/** Body shape for POST /purchase-orders/:id/shipment — one shipment allowed per PO. */
export interface AddShipmentDto {
  shipmentNo?: string;
  transportMode?: ShipmentTransportMode;
  transportCompany?: string;
  containerNo?: string;
  vehicleNo?: string;
  trackingNo?: string;
  etd?: string;
  eta?: string;
  arrivalDate?: string;
  status?: ShipmentStatus;
  freightCost?: number;
  loadingCost?: number;
  unloadingCost?: number;
  fuelCost?: number;
  miscellaneousCost?: number;
  /** Local-purchase-only cost line. */
  localTaxCost?: number;
}

/** Body shape for PUT /shipments/:id. */
export type UpdateShipmentDto = Partial<AddShipmentDto>;

/** Body shape for POST /shipments/:id/insurance — optional, "only if applicable". */
export interface AddInsuranceDto {
  insuranceCompany?: string;
  policyNumber?: string;
  coverage?: number;
  premium?: number;
  claimStatus?: string;
}

/** Body shape for PUT /insurance/:id. */
export type UpdateInsuranceDto = Partial<AddInsuranceDto>;
