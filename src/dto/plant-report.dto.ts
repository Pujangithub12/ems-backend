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
}
