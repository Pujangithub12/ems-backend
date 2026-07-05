/** Body shape for POST /tasks/:taskId/subtasks. */
export interface AddSubTaskDto {
  title: string;
  parentSubTaskId?: string | number;
}

/** Body shape for PUT /tasks/:taskId/subtasks/:subtaskId. */
export interface UpdateSubTaskDto {
  title?: string;
  status?: string;
  progress?: string | number;
}
