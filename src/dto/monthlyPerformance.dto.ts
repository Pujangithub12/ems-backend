/** Body shape for PUT /projects/:projectId/performance — upserts a single month's row. */
export interface UpsertMonthlyPerformanceDto {
  year: number;
  month: number;
  contractEnergy?: number | null;
  actualGeneration?: number | null;
  incomeReceived?: number | null;
  monthlyExpenditure?: number | null;
  sparePartPurchase?: number | null;
}
