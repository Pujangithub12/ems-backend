import { AppDataSource } from "../config/data-source";
import { HierarchyNode } from "../entities/HierarchyNode";
import { UserRole } from "../entities/User";

/**
 * Loads every HierarchyNode for a workspace once and returns the ordered
 * chain of ancestor nodes (nearest manager first) above the given user's
 * node — walking the primary (solid-line) `parentId` chain only, never the
 * dotted-line `secondaryManagers`. Bounded by node count so a data anomaly
 * can't loop forever (saveHierarchy already rejects cycles on write, this is
 * just defense in depth on read).
 */
export async function getAncestorChain(
  workspaceId: number,
  userId: number,
): Promise<HierarchyNode[]> {
  const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);
  const nodes = await hierarchyRepo.find({
    where: { workspaceId },
    relations: ["user"],
  });
  const nodeByUserId = new Map(nodes.map((n) => [n.userId, n]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const chain: HierarchyNode[] = [];
  let current = nodeByUserId.get(userId);
  const seen = new Set<number>();
  while (current?.parentId != null && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = nodeById.get(current.parentId);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/** Self counts as a descendant of itself, so self-assignment is always allowed. */
export async function isDescendant(
  workspaceId: number,
  ancestorUserId: number,
  descendantUserId: number,
): Promise<boolean> {
  if (ancestorUserId === descendantUserId) return true;
  const chain = await getAncestorChain(workspaceId, descendantUserId);
  return chain.some((n) => n.userId === ancestorUserId);
}

/**
 * Every user id below `ancestorUserId` in the primary-manager tree, at any
 * depth (does not include the ancestor themselves). Used to validate/expand
 * a whole task-assignment list in one query instead of walking each
 * candidate's chain individually.
 */
export async function getDescendantUserIds(
  workspaceId: number,
  ancestorUserId: number,
): Promise<number[]> {
  const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);
  const nodes = await hierarchyRepo.find({ where: { workspaceId } });

  const childrenByParentNodeId = new Map<number, HierarchyNode[]>();
  nodes.forEach((n) => {
    if (n.parentId == null) return;
    const list = childrenByParentNodeId.get(n.parentId) || [];
    list.push(n);
    childrenByParentNodeId.set(n.parentId, list);
  });

  const ancestorNode = nodes.find((n) => n.userId === ancestorUserId);
  if (!ancestorNode) return [];

  const result: number[] = [];
  const queue = [...(childrenByParentNodeId.get(ancestorNode.id) || [])];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.userId != null) result.push(node.userId);
    queue.push(...(childrenByParentNodeId.get(node.id) || []));
  }
  return result;
}

/**
 * The nearest ancestor (in the primary-manager chain) who actually holds an
 * admin/super_admin role — the single person "the admin of that user" refers
 * to. Returns null if the chain never reaches one (e.g. the requester hasn't
 * been placed under anyone in the tree yet).
 */
export async function getApprover(
  workspaceId: number,
  requesterUserId: number,
): Promise<{ userId: number } | null> {
  const chain = await getAncestorChain(workspaceId, requesterUserId);
  const approver = chain.find(
    (n) => n.user?.role === UserRole.ADMIN || n.user?.role === UserRole.SUPER_ADMIN,
  );
  return approver?.userId != null ? { userId: approver.userId } : null;
}

/**
 * Whether `actorUserId` may approve/reject a request submitted by
 * `requesterUserId`. A super admin (the account's root) always can, as a
 * fallback so requests never get permanently stuck while the org chart is
 * still being filled in — everyone else must be that requester's nearest
 * admin ancestor.
 */
export async function canApprove(
  workspaceId: number,
  actorUserId: number,
  actorRole: string,
  requesterUserId: number,
): Promise<boolean> {
  if (actorRole === UserRole.SUPER_ADMIN) return true;
  const approver = await getApprover(workspaceId, requesterUserId);
  return approver?.userId === actorUserId;
}
