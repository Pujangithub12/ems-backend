import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import type { FileAccessLevel } from "../types/domain";
import type { FileAccessModel as FileAccess, ProjectFileModel as ProjectFile } from "../generated/prisma/models";

/**
 * Resolves who can see/edit a file or folder. Walks ProjectFile.parentId
 * from the target node up to the root; the *nearest* node in that chain that
 * has a grant for this user wins (a user-specific grant beats a role-wide
 * grant at the same node). A chain with no grant anywhere resolves to
 * "none" — unassigned files/folders are closed by default, not open.
 * super_admin/admin always resolve to "write": they're the only roles that
 * can hand out grants in the first place, so they can't lock themselves out.
 */
export function resolveAccessLevel(
  fileId: number,
  parentIdByFileId: Map<number, number | null>,
  grantsByFileId: Map<number, (FileAccess & { userId?: number | null })[]>,
  userId: number,
  role: string,
): FileAccessLevel {
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) return "write";

  let currentId: number | null = fileId;
  const seen = new Set<number>();
  while (currentId != null && !seen.has(currentId)) {
    seen.add(currentId);
    const grants = grantsByFileId.get(currentId) || [];
    const userGrant = grants.find((g) => g.granteeType === "user" && g.userId === userId);
    if (userGrant) return userGrant.level as FileAccessLevel;
    const roleGrant = grants.find((g) => g.granteeType === "role" && g.role === role);
    if (roleGrant) return roleGrant.level as FileAccessLevel;
    currentId = parentIdByFileId.get(currentId) ?? null;
  }
  return "none";
}

/** Builds the two lookup maps resolveAccessLevel needs, from a flat list of files + their grants. */
export function buildAccessMaps(files: { id: number; parentId?: number | null }[], grants: FileAccess[]) {
  const parentIdByFileId = new Map<number, number | null>(files.map((f) => [f.id, f.parentId ?? null]));
  const grantsByFileId = new Map<number, FileAccess[]>();
  grants.forEach((g) => {
    const key = g.fileId!;
    const list = grantsByFileId.get(key) || [];
    list.push(g);
    grantsByFileId.set(key, list);
  });
  return { parentIdByFileId, grantsByFileId };
}

/** Filters a file/folder list down to what `userId`/`role` can see, and tags each row with its resolved level. */
export function filterAndAnnotate<T extends { id: number; parentId?: number | null }>(
  files: T[],
  grants: FileAccess[],
  userId: number,
  role: string,
): (T & { myAccessLevel: FileAccessLevel })[] {
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
export async function loadFileAccessScope(file: ProjectFile) {
  const files = await prisma.projectFile.findMany({
    where: file.projectId
      ? { projectId: file.projectId }
      : { organizationId: file.organizationId!, projectId: null },
  });
  const fileIds = files.map((f) => f.id);
  const grants = fileIds.length
    ? await prisma.fileAccess.findMany({
        where: { fileId: { in: fileIds } },
      })
    : [];

  return { files, grants };
}

/** Convenience: resolve just one file's level for the requesting user, loading its scope first. */
export async function resolveAccessForFile(
  file: ProjectFile,
  userId: number,
  role: string,
): Promise<FileAccessLevel> {
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) return "write";
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
export async function grantCreatorAccess(file: ProjectFile, userId: number, role: string, organizationId: number) {
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) return;
  await prisma.fileAccess.create({
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
