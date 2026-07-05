/** Body shape for POST /announcements. */
export interface CreateAnnouncementDto {
  subject: string;
  message: string;
  targetType: "all" | "specific";
  targetEmails?: string[];
}
