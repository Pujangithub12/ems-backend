/** Body shape for PUT /permissions. */
export interface UpdatePermissionsDto {
  updates: { role: string; permissionKey: string; granted: boolean }[];
}
