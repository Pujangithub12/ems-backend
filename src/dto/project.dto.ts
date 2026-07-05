/** Body shape for POST /projects. */
export interface CreateProjectDto {
  name: string;
  description?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
  assigneeIds?: number[];
}

/** Body shape for PUT /projects/:id. */
export interface UpdateProjectDto {
  name?: string;
  description?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
  assigneeIds?: number[];
}

/** Body shape for POST /projects/:projectId/headings. */
export interface AddProjectHeadingDto {
  name: string;
  parentHeadingId?: string | number;
}

/** Body shape for POST /projects/:projectId/tasks. */
export interface AddProjectTaskDto {
  title: string;
  description: string;
  dueDate: string;
  headingId?: string | number;
  priority?: string;
  assignedUserIds?: number[];
  status?: string;
}

/** Body shape for PUT /projects/tasks/:taskId. */
export interface UpdateProjectTaskDto {
  title?: string;
  description?: string;
  dueDate?: string;
  progress?: number;
  status?: string;
  priority?: string;
}
