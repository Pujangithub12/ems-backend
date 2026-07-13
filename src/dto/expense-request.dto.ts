/** Body shape for POST /expense. */
export interface CreateExpenseRequestDto {
  title: string;
  amount: number;
  category: string;
  expenseDate: string;
  reason: string;
}

/** Body shape for PUT /expense/:id. */
export interface UpdateExpenseRequestDto {
  amount?: number;
  category?: string;
  expenseDate?: string;
  reason?: string;
}

/** Body shape for PUT /expense/:id/status. */
export interface UpdateExpenseRequestStatusDto {
  status: string;
}
