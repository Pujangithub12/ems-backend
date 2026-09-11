/** Body shape for PUT /projects/:projectId/performance/daily — upserts a single day's row.
 * `generation` is not client-writable — it's derived server-side from
 * mainMeterFinal - mainMeterInitial (Check Meter is a secondary, unsummed figure). */
export interface UpsertDailyGenerationDto {
  date: string; // YYYY-MM-DD (AD) — always the authoritative, converted value; never a raw BS string.
  /** Free-text Bikram Sambat date note (e.g. "2083 Bhadra 13") — audit trail for when this
   * entry was entered/uploaded as a BS date. Omit to leave the stored value untouched. */
  dateBs?: string | null;
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

/** Body shape for DELETE /projects/:projectId/performance/daily — deletes one
 * or more days at once (single delete just sends a one-element array). */
export interface DeleteDailyGenerationDto {
  dates: string[]; // YYYY-MM-DD (AD)
}
