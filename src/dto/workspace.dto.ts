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

/** Body shape for PUT /workspaces/:id/members/:userId. Role is optional and
 * defaults to UserRole.USER — there's no global role to inherit anymore
 * (role is per-workspace, see WorkspaceMembership), and older frontend
 * callers that don't send a role should still get a sane default. */
export interface GrantMemberAccessDto {
  role?: string;
}
