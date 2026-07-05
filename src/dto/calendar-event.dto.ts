/** Body shape for POST /events. */
export interface CreateCalendarEventDto {
  title: string;
  date: string;
  type?: string;
}
