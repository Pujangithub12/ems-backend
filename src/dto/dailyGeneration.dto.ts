/** Body shape for PUT /projects/:projectId/performance/daily — upserts a single day's row.
 * `generation` is not client-writable — it's derived server-side from
 * checkMeterFinal - checkMeterInitial. */
export interface UpsertDailyGenerationDto {
  date: string; // YYYY-MM-DD (AD)
  checkMeterInitial?: number | null;
  checkMeterFinal?: number | null;
  mainMeterInitial?: number | null;
  mainMeterFinal?: number | null;
}

/** One date-range bucket to sum generation over, for the trend chart. `key` is
 * an opaque caller-defined label (e.g. a BS month number) echoed back in the response. */
export interface GenerationSummaryBucket {
  key: number;
  startDate: string;
  endDate: string;
}

export interface GenerationSummaryBucketResult {
  key: number;
  generation: number | null;
}
