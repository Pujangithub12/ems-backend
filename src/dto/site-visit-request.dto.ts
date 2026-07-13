/** Body shape for POST /sitevisit. */
export interface CreateSiteVisitRequestDto {
  title: string;
  location: string;
  visitDate: string;
  reason: string;
}

/** Body shape for PUT /sitevisit/:id. */
export interface UpdateSiteVisitRequestDto {
  location?: string;
  visitDate?: string;
  reason?: string;
}

/** Body shape for PUT /sitevisit/:id/status. */
export interface UpdateSiteVisitRequestStatusDto {
  status: string;
}
