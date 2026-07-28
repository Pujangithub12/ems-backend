"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAccessLevel = resolveAccessLevel;
exports.buildAccessMaps = buildAccessMaps;
exports.filterAndAnnotate = filterAndAnnotate;
exports.loadFileAccessScope = loadFileAccessScope;
exports.resolveAccessForFile = resolveAccessForFile;
exports.grantCreatorAccess = grantCreatorAccess;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
/**
 * Resolves who can see/edit a file or folder. Walks ProjectFile.parentId
 * from the target node up to the root; the *nearest* node in that chain that
 * has a grant for this user wins (a user-specific grant beats a role-wide
 * grant at the same node). A chain with no grant anywhere resolves to
 * "none" — unassigned files/folders are closed by default, not open.
 * super_admin/admin always resolve to "write": they're the only roles that
 * can hand out grants in the first place, so they can't lock themselves out.
 */
function resolveAccessLevel(fileId, parentIdByFileId, grantsByFileId, userId, role) {
    if (role === enums_1.UserRole.ADMIN || role === enums_1.UserRole.SUPER_ADMIN)
        return "write";
    let currentId = fileId;
    const seen = new Set();
    while (currentId != null && !seen.has(currentId)) {
        seen.add(currentId);
        const grants = grantsByFileId.get(currentId) || [];
        const userGrant = grants.find((g) => g.granteeType === "user" && g.userId === userId);
        if (userGrant)
            return userGrant.level;
        const roleGrant = grants.find((g) => g.granteeType === "role" && g.role === role);
        if (roleGrant)
            return roleGrant.level;
        currentId = parentIdByFileId.get(currentId) ?? null;
    }
    return "none";
}
/** Builds the two lookup maps resolveAccessLevel needs, from a flat list of files + their grants. */
function buildAccessMaps(files, grants) {
    const parentIdByFileId = new Map(files.map((f) => [f.id, f.parentId ?? null]));
    const grantsByFileId = new Map();
    grants.forEach((g) => {
        const key = g.fileId;
        const list = grantsByFileId.get(key) || [];
        list.push(g);
        grantsByFileId.set(key, list);
    });
    return { parentIdByFileId, grantsByFileId };
}
/** Filters a file/folder list down to what `userId`/`role` can see, and tags each row with its resolved level. */
function filterAndAnnotate(files, grants, userId, role) {
    const { parentIdByFileId, grantsByFileId } = buildAccessMaps(files, grants);
    return files
        .map((f) => ({
        ...f,
        myAccessLevel: resolveAccessLevel(f.id, parentIdByFileId, grantsByFileId, userId, role),
    }))
        .filter((f) => f.myAccessLevel !== "none");
}
/**
 * Loads every ProjectFile + FileAccess grant in the same "scope" as `file`
 * (its whole project's Documents tab, or the organization root when project
 * is null) — enough to walk the full ancestor chain in memory. Scopes are
 * expected to stay small (a project's or organization's document tree), so
 * one query per side is cheap and much simpler than N recursive parent lookups.
 */
async function loadFileAccessScope(file) {
    const files = await prisma_1.prisma.projectFile.findMany({
        where: file.projectId
            ? { projectId: file.projectId }
            : { organizationId: file.organizationId, projectId: null },
    });
    const fileIds = files.map((f) => f.id);
    const grants = fileIds.length
        ? await prisma_1.prisma.fileAccess.findMany({
            where: { fileId: { in: fileIds } },
        })
        : [];
    return { files, grants };
}
/** Convenience: resolve just one file's level for the requesting user, loading its scope first. */
async function resolveAccessForFile(file, userId, role) {
    if (role === enums_1.UserRole.ADMIN || role === enums_1.UserRole.SUPER_ADMIN)
        return "write";
    const { files, grants } = await loadFileAccessScope(file);
    const { parentIdByFileId, grantsByFileId } = buildAccessMaps(files, grants);
    return resolveAccessLevel(file.id, parentIdByFileId, grantsByFileId, userId, role);
}
/**
 * A newly-created file/folder starts with no grants, which — per the
 * default-closed rule — would make it invisible even to the person who just
 * created it (unless they're admin/super_admin, who bypass the ACL
 * entirely). Give the creator an explicit "write" grant on their own new
 * node so they always retain access to what they make; everyone else stays
 * locked out until an admin explicitly shares it.
 */
async function grantCreatorAccess(file, userId, role, organizationId) {
    if (role === enums_1.UserRole.ADMIN || role === enums_1.UserRole.SUPER_ADMIN)
        return;
    await prisma_1.prisma.fileAccess.create({
        data: {
            fileId: file.id,
            granteeType: "user",
            userId,
            level: "write",
            organizationId,
            grantedById: userId,
        },
    });
}
//# sourceMappingURL=fileAccess.js.map