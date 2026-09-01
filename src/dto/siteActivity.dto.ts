export const VALID_ITEM_STATUS = new Set(["ongoing", "completed"]);
export const VALID_EQUIPMENT_CONDITION = new Set(["working", "idle", "breakdown"]);
export const VALID_REPORT_STATUS = new Set(["draft", "submitted"]);
export const VALID_WEATHER_SLOT = new Set(["morning", "afternoon", "evening"]);
export const VALID_RAINFALL = new Set(["no_rainfall", "light", "moderate", "heavy"]);
export const VALID_SAFETY_TYPE = new Set(["observation", "incident"]);

export interface SaveSiteActivityItemDto {
  description: string;
  chainage?: string | null;
  todayQty?: number | null;
  unit?: string | null;
  status?: string;
  remarks?: string | null;
}

export interface SaveSiteActivityEquipmentDto {
  equipmentName: string;
  quantity?: number | null;
  workingHours?: number | null;
  condition?: string;
}

export interface SaveSiteActivityManpowerDto {
  role: string;
  headcount?: number | null;
}

export interface SaveSiteActivityWeatherDto {
  slot: string;
  condition?: string | null;
  tempC?: number | null;
  rainfall?: string | null;
  remarks?: string | null;
}

export interface SaveSiteActivityMaterialDto {
  materialType: string;
  receivedQuantity?: number | null;
  receivedUnit?: string | null;
  usedQuantity?: number | null;
  usedUnit?: string | null;
  remarks?: string | null;
}

export interface SaveSiteActivitySafetyDto {
  type: string;
  description?: string | null;
  actionTaken?: string | null;
}

export interface SaveSiteActivityInstructionDto {
  description?: string | null;
  byWhom?: string | null;
  toWhom?: string | null;
  time?: string | null;
  signatureOf?: string | null;
}

/** Body shape for POST /site-activity-reports?projectId — full-replace
 * semantics for every child section (delete-all-then-reinsert), same
 * convention this codebase already uses for Schedule/PlantReport staff. */
export interface SaveSiteActivityReportDto {
  reportDate: string;
  location?: string | null;
  status?: string;
  activities?: SaveSiteActivityItemDto[];
  equipment?: SaveSiteActivityEquipmentDto[];
  manpower?: SaveSiteActivityManpowerDto[];
  weather?: SaveSiteActivityWeatherDto[];
  materials?: SaveSiteActivityMaterialDto[];
  safety?: SaveSiteActivitySafetyDto[];
  instructions?: SaveSiteActivityInstructionDto[];
}
