/** Body shape for POST /workspaces. */
export interface CreateWorkspaceDto {
  name: string;
  description?: string;
}

/** Body shape for POST /workspaces/switch. */
export interface SwitchWorkspaceDto {
  workspaceId: string | number;
}

/** Body shape for PUT /workspaces/:id. */
export interface UpdateWorkspaceDto {
  name: string;
  description?: string;
}

/** Body shape for DELETE /workspaces/:id. */
export interface DeleteWorkspaceDto {
  confirmName: string;
}
