/** Body shape for PUT /projects/:projectId/performance — upserts a single month's row.
 * actualGeneration is intentionally absent: it's derived from DailyGeneration rows
 * (see DailyGenerationController) and is never written through this endpoint. */
export interface UpsertMonthlyPerformanceDto {
  year: number;
  month: number;
  contractEnergy?: number | null;
  incomeReceived?: number | null;
  monthlyExpenditure?: number | null;
  sparePartPurchase?: number | null;
}
