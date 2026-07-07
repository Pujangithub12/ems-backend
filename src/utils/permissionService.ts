import { AppDataSource } from "../config/data-source";
import { RolePermission } from "../entities/RolePermission";
import {
  ALL_PERMISSION_KEYS,
  ALL_PERMISSION_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PermissionKey,
} from "../config/permissions";

/**
 * One-time (but idempotent — safe to call on every startup) seed so every
 * (role, permissionKey) pair has an explicit row matching today's real
 * behavior. Called from index.ts alongside seedAdmin/seedSuperAdmin.
 */
export async function seedRolePermissions() {
  const repo = AppDataSource.getRepository(RolePermission);
  const existing = await repo.find();
  const existingKeys = new Set(existing.map((r) => `${r.role}:${r.permissionKey}`));

  const toInsert: RolePermission[] = [];
  for (const role of ALL_PERMISSION_ROLES) {
    for (const key of ALL_PERMISSION_KEYS) {
      if (!existingKeys.has(`${role}:${key}`)) {
        toInsert.push(
          repo.create({
            role,
            permissionKey: key,
            granted: DEFAULT_ROLE_PERMISSIONS[role].includes(key),
          }),
        );
      }
    }
  }

  if (toInsert.length > 0) {
    await repo.save(toInsert);
  }
}

/** Full role x permissionKey grid, DB overrides layered on top of defaults. */
export async function getPermissionMatrix(): Promise<
  Record<string, Record<string, boolean>>
> {
  const repo = AppDataSource.getRepository(RolePermission);
  const rows = await repo.find();

  const matrix: Record<string, Record<string, boolean>> = {};
  for (const role of ALL_PERMISSION_ROLES) {
    matrix[role] = {};
    for (const key of ALL_PERMISSION_KEYS) {
      matrix[role][key] = DEFAULT_ROLE_PERMISSIONS[role].includes(key);
    }
  }
  for (const row of rows) {
    const roleRow = matrix[row.role];
    if (roleRow) {
      roleRow[row.permissionKey] = row.granted;
    }
  }
  return matrix;
}

/** Single (role, permissionKey) check — used by permissionMiddleware and any inline gate. */
export async function roleHasPermission(
  role: string | undefined,
  key: PermissionKey,
): Promise<boolean> {
  if (!role) return false;
  const repo = AppDataSource.getRepository(RolePermission);
  const row = await repo.findOne({ where: { role, permissionKey: key } });
  if (row) return row.granted;
  return (
    DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS]?.includes(
      key,
    ) ?? false
  );
}
