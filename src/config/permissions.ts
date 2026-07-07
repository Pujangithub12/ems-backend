/**
 * The set of permissions that are actually enforced by a real backend gate
 * (as opposed to the "view" style rows on the Roles & Permissions matrix,
 * which every role has always had — there's no route to gate for those, so
 * they aren't part of this dynamic, super-admin-editable set).
 */
export type PermissionKey =
  | "projects.manage"
  | "projects.schedule"
  | "projects.documents"
  | "tasks.edit"
  | "tasks.delete"
  | "tasks.feedback"
  | "announcements.manage"
  | "members.manage"
  | "leave.manage"
  | "calendar.manage"
  | "workspace.manage"
  | "hierarchy.manage";

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "projects.manage",
  "projects.schedule",
  "projects.documents",
  "tasks.edit",
  "tasks.delete",
  "tasks.feedback",
  "announcements.manage",
  "members.manage",
  "leave.manage",
  "calendar.manage",
  "workspace.manage",
  "hierarchy.manage",
];

export const ALL_PERMISSION_ROLES = [
  "super_admin",
  "admin",
  "finance",
  "user",
] as const;
export type PermissionRole = (typeof ALL_PERMISSION_ROLES)[number];

/**
 * Matches the app's pre-existing behavior exactly (every one of these gates
 * was previously a hardcoded admin+super_admin-only roleMiddleware check) —
 * this is what a role gets before any super admin ever edits the matrix.
 *
 * Finance is a narrower, in-between role: it only gets the one existing gate
 * that maps to something in its remit (uploading/managing project documents).
 * A super admin can grant it more of the keys above from the Roles &
 * Permissions matrix at any time — this is just the starting default.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<PermissionRole, PermissionKey[]> = {
  super_admin: [...ALL_PERMISSION_KEYS],
  admin: [...ALL_PERMISSION_KEYS],
  finance: ["projects.documents"],
  user: [],
};

export const isPermissionKey = (value: string): value is PermissionKey =>
  (ALL_PERMISSION_KEYS as string[]).includes(value);

export const isPermissionRole = (value: string): value is PermissionRole =>
  (ALL_PERMISSION_ROLES as readonly string[]).includes(value);
