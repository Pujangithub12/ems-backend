/** Body shape for POST /tasks. */
export interface CreateTaskDto {
  title: string;
  description?: string;
  priority: string;
  dueDate: string;
  userIds?: string | number[];
  assignAll?: string | boolean;
  projectId?: string | number;
  progress?: string | number;
  subTasks?: string | any[];
  projectName?: string;
}

/** Body shape for PUT /tasks/:id. */
export interface UpdateTaskDto {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  status?: string;
  userIds?: string | number[];
  assignAll?: string | boolean;
  projectId?: string | number;
  progress?: string | number;
  subTasks?: string | any[];
  projectName?: string;
}

/** Body shape for PUT /tasks/:id/progress. */
export interface UpdateTaskProgressDto {
  progress: string | number;
}

/** Body shape for PUT /tasks/:id/status. */
export interface UpdateTaskStatusDto {
  status: string;
}
