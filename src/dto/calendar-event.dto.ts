/** Body shape for POST /events/copy. */
export interface CopyCalendarEventsDto {
  targetOrganizationIds: number[];
  /** Events (of the current organization) to copy. Omit to copy every event. */
  eventIds?: number[];
}

/** Body shape for POST /events. */
export interface CreateCalendarEventDto {
  title: string;
  date: string;
  type?: string;
}
