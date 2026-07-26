/** Body shape for POST /tasks/:taskId/subtasks. */
export interface AddSubTaskDto {
  title: string;
  parentSubTaskId?: string | number;
}

/** Body shape for PUT /tasks/:taskId/subtasks/:subtaskId. */
export interface UpdateSubTaskDto {
  title?: string;
  /** Renames the subtask itself — separate from `title`, which is actually the free-text note logged into history/comments for a progress update. */
  name?: string;
  status?: string;
  progress?: string | number;
}
