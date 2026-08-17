export type PlantReportFieldDataType = "text" | "number" | "date" | "boolean";

/** Body shape for POST /plant-reports and PUT /plant-reports/:id. */
export interface SavePlantReportDto {
  date: string;
  projectId?: number | null;
  steamInitial?: number | null;
  steamFinal?: number | null;
  steamPressure?: number | null;
  steamTemp?: number | null;
  feedwaterTemp?: number | null;
  pelletUsedKg?: number | null;
  pelletsBag?: number | null;
  pelletReceivedKg?: number | null;
  waterInitial?: number | null;
  waterFinal?: number | null;
  burnerStatus?: "running" | "stopped" | "maintenance" | null;
  burnerHours?: number | null;
  shutdownReason?: string | null;
  /** User ids of staff present that day. */
  staffUserIds?: number[];
  /** Values for this organization's custom fields, keyed by field id (as a
   * string — JSON object keys are always strings). Unknown keys (a field id
   * that isn't one of this organization's PlantReportCustomField rows) are
   * silently dropped; see PlantReportController's coerceCustomValues. */
  customValues?: Record<string, unknown>;
  /** Readings for this organization's tracked items (Pellets, Diesel, etc).
   * Unknown itemIds (deleted/wrong org) are silently dropped — same
   * tolerance as customValues above. */
  itemEntries?: PlantReportItemEntryInput[];
}

/** Body shape for POST /plant-report-fields and PUT /plant-report-fields/:id. */
export interface SavePlantReportFieldDto {
  name: string;
  dataType: PlantReportFieldDataType;
}

export interface PlantReportItemDto {
  id: number;
  name: string;
  unit: string;
  trackStock: boolean;
  isActive: boolean;
  sortOrder: number;
}

/** Body shape for POST /plant-report-items and PUT /plant-report-items/:id. */
export interface SavePlantReportItemDto {
  name: string;
  unit: string;
  trackStock?: boolean;
  isActive?: boolean;
}

/** One item's reading, submitted as part of SavePlantReportDto.itemEntries. */
export interface PlantReportItemEntryInput {
  itemId: number;
  receivedQty?: number | null;
  usedQty?: number | null;
  note?: string | null;
}
