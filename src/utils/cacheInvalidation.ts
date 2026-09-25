import { cacheDelPrefix } from "./cache";
import { invalidateAllAuthUsers, invalidateAuthUser } from "./authCache";

/** Every cached GET response lives under this prefix: `rc:{group}:{orgId}:{scope}:{url}`. */
export const RESPONSE_CACHE_PREFIX = "rc:";

/**
 * Which Prisma models feed each cached endpoint ("group"). A write to ANY model
 * listed for a group clears that group's cached responses (see onModelWrite,
 * called from the Prisma extension in config/prisma.ts) — so controllers never
 * need to remember to invalidate, and a new write path can't forget to.
 *
 * When adding a cached endpoint, list every model its query touches —
 * including models pulled in through `include` — or edits to those will show
 * up stale until the TTL runs out.
 */
export const CACHE_GROUPS: Record<string, string[]> = {
  dashboard: ["Task", "TaskAssignee", "LeaveRequest", "User"],
  projects: ["Project", "ProjectAssignee", "ProjectFile", "ProjectHeading", "Task", "TaskAssignee", "User"],
  users: ["User", "OrganizationMembership"],
  purchaseBills: ["PurchaseBill", "Vendor", "Project", "User"],
  materials: ["Material", "MaterialTransaction", "Vendor", "Project"],
  catalogItems: ["CatalogItem"],
  permissions: ["RolePermission"],
};

const GROUPS_BY_MODEL = new Map<string, string[]>();
for (const [group, models] of Object.entries(CACHE_GROUPS)) {
  for (const model of models) GROUPS_BY_MODEL.set(model, [...(GROUPS_BY_MODEL.get(model) ?? []), group]);
}

const isWrite = (operation: string) => /^(create|update|upsert|delete)/.test(operation);

/** The organization a write targets, when the query itself names it — lets us
 * clear just that organization's entries instead of every organization's. */
const organizationIdOf = (args: unknown): number | null => {
  const a = args as { data?: { organizationId?: unknown }; where?: { organizationId?: unknown }; create?: { organizationId?: unknown } } | undefined;
  const id = a?.data?.organizationId ?? a?.where?.organizationId ?? a?.create?.organizationId;
  return typeof id === "number" ? id : null;
};

/** Runs after every Prisma write: clears the auth cache and any cached
 * responses that were built from the model that just changed. */
export async function onModelWrite(model: string, operation: string, args: unknown): Promise<void> {
  if (!isWrite(operation)) return;

  const tasks: Promise<void>[] = [];

  if (model === "User") {
    const id = (args as { where?: { id?: unknown } } | undefined)?.where?.id;
    tasks.push(typeof id === "number" ? invalidateAuthUser(id) : invalidateAllAuthUsers());
  } else if (model === "OrganizationMembership" || model === "Organization") {
    tasks.push(invalidateAllAuthUsers());
  }

  // Deleting/renaming an organization can change anything cached under it.
  if (model === "Organization") {
    tasks.push(cacheDelPrefix(RESPONSE_CACHE_PREFIX));
  } else {
    const orgId = organizationIdOf(args);
    for (const group of GROUPS_BY_MODEL.get(model) ?? []) {
      tasks.push(cacheDelPrefix(orgId != null ? `${RESPONSE_CACHE_PREFIX}${group}:${orgId}:` : `${RESPONSE_CACHE_PREFIX}${group}:`));
    }
  }

  await Promise.all(tasks);
}
