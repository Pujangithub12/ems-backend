/** Body shape for POST /leaverequest. */
export interface CreateLeaveRequestDto {
  title: string;
  startDate: string;
  endDate: string;
  reason: string;
}

/** Body shape for PUT /leaverequest/:id. */
export interface UpdateLeaveRequestDto {
  startDate?: string;
  endDate?: string;
  reason?: string;
}

/** Body shape for PUT /leaverequest/:id/status. */
export interface UpdateLeaveRequestStatusDto {
  status: string;
}
