/** Body shape for POST /mytasks. */
export interface CreateMyTaskDto {
  title: string;
  description?: string;
  dueDate?: string;
}

/** Body shape for PUT /mytasks/:id. */
export interface UpdateMyTaskDto {
  title?: string;
  description?: string;
  dueDate?: string | null;
  status?: string;
}
