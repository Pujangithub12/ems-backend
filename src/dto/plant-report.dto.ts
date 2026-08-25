export type PlantReportFieldDataType = "text" | "number" | "date" | "boolean";

/** Body shape for POST /plant-reports and PUT /plant-reports/:id. */
export interface SavePlantReportDto {
  date: string;
  projectId?: number | null;
  /** User ids of staff present that day. */
  staffUserIds?: number[];
  /** Values for this organization's custom fields, keyed by field id (as a
   * string — JSON object keys are always strings). Unknown keys (a field id
   * that isn't one of this organization's PlantReportCustomField rows) are
   * silently dropped; see PlantReportController's coerceCustomValues. */
  customValues?: Record<string, unknown>;
}

/** Body shape for POST /plant-report-fields and PUT /plant-report-fields/:id. */
export interface SavePlantReportFieldDto {
  name: string;
  dataType: PlantReportFieldDataType;
}
