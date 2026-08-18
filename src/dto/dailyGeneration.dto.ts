/** Body shape for PUT /projects/:projectId/performance/daily — upserts a single day's row. */
export interface UpsertDailyGenerationDto {
  date: string; // YYYY-MM-DD
  generation?: number | null;
}

export interface MonthlyGenerationSummaryRow {
  month: number;
  generation: number | null;
  contractEnergy: number | null;
}
