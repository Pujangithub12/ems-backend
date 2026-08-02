"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPermissionRole = exports.isPermissionKey = exports.DEFAULT_ROLE_PERMISSIONS = exports.ALL_PERMISSION_ROLES = exports.ALL_PERMISSION_KEYS = void 0;
exports.ALL_PERMISSION_KEYS = [
    "projects.manage",
    "projects.schedule",
    "projects.documents",
    "projects.procurement",
    "projects.performance",
    "projects.inventory",
    "tasks.edit",
    "tasks.delete",
    "tasks.feedback",
    "announcements.manage",
    "members.manage",
    "leave.manage",
    "sitevisit.manage",
    "expense.manage",
    "calendar.manage",
    "workspace.manage",
    "hierarchy.manage",
];
exports.ALL_PERMISSION_ROLES = [
    "super_admin",
    "admin",
    "finance",
    "user",
];
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
exports.DEFAULT_ROLE_PERMISSIONS = {
    super_admin: [...exports.ALL_PERMISSION_KEYS],
    admin: [...exports.ALL_PERMISSION_KEYS],
    finance: ["projects.documents", "expense.manage"],
    user: [],
};
const isPermissionKey = (value) => exports.ALL_PERMISSION_KEYS.includes(value);
exports.isPermissionKey = isPermissionKey;
const isPermissionRole = (value) => exports.ALL_PERMISSION_ROLES.includes(value);
exports.isPermissionRole = isPermissionRole;
//# sourceMappingURL=permissions.js.map