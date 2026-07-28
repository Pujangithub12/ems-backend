"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedRolePermissions = seedRolePermissions;
exports.getPermissionMatrix = getPermissionMatrix;
exports.roleHasPermission = roleHasPermission;
const prisma_1 = require("../config/prisma");
const permissions_1 = require("../config/permissions");
/**
 * One-time (but idempotent — safe to call on every startup) seed so every
 * (role, permissionKey) pair has an explicit row matching today's real
 * behavior. Called from index.ts alongside seedAdmin/seedSuperAdmin.
 */
async function seedRolePermissions() {
    const existing = await prisma_1.prisma.rolePermission.findMany();
    const existingKeys = new Set(existing.map((r) => `${r.role}:${r.permissionKey}`));
    const toInsert = [];
    for (const role of permissions_1.ALL_PERMISSION_ROLES) {
        for (const key of permissions_1.ALL_PERMISSION_KEYS) {
            if (!existingKeys.has(`${role}:${key}`)) {
                toInsert.push({
                    role,
                    permissionKey: key,
                    granted: permissions_1.DEFAULT_ROLE_PERMISSIONS[role].includes(key),
                });
            }
        }
    }
    if (toInsert.length > 0) {
        await prisma_1.prisma.rolePermission.createMany({ data: toInsert });
    }
}
/** Full role x permissionKey grid, DB overrides layered on top of defaults. */
async function getPermissionMatrix() {
    const rows = await prisma_1.prisma.rolePermission.findMany();
    const matrix = {};
    for (const role of permissions_1.ALL_PERMISSION_ROLES) {
        matrix[role] = {};
        for (const key of permissions_1.ALL_PERMISSION_KEYS) {
            matrix[role][key] = permissions_1.DEFAULT_ROLE_PERMISSIONS[role].includes(key);
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
async function roleHasPermission(role, key) {
    if (!role)
        return false;
    const row = await prisma_1.prisma.rolePermission.findFirst({ where: { role, permissionKey: key } });
    if (row)
        return row.granted;
    return (permissions_1.DEFAULT_ROLE_PERMISSIONS[role]?.includes(key) ?? false);
}
//# sourceMappingURL=permissionService.js.map