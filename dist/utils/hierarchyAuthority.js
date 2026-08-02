"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAncestorChain = getAncestorChain;
exports.isDescendant = isDescendant;
exports.getDescendantUserIds = getDescendantUserIds;
exports.getApprover = getApprover;
exports.canApprove = canApprove;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
/**
 * Loads every HierarchyNode for an organization once and returns the ordered
 * chain of ancestor nodes (nearest manager first) above the given user's
 * node — walking the primary (solid-line) `parentId` chain only, never the
 * dotted-line `secondaryManagers`. Bounded by node count so a data anomaly
 * can't loop forever (saveHierarchy already rejects cycles on write, this is
 * just defense in depth on read).
 */
async function getAncestorChain(organizationId, userId) {
    const nodes = await prisma_1.prisma.hierarchyNode.findMany({
        where: { organizationId },
    });
    const nodeByUserId = new Map(nodes.map((n) => [n.userId, n]));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const chain = [];
    let current = nodeByUserId.get(userId);
    const seen = new Set();
    while (current?.parentId != null && !seen.has(current.parentId)) {
        seen.add(current.parentId);
        const parent = nodeById.get(current.parentId);
        if (!parent)
            break;
        chain.push(parent);
        current = parent;
    }
    return chain;
}
/** Self counts as a descendant of itself, so self-assignment is always allowed. */
async function isDescendant(organizationId, ancestorUserId, descendantUserId) {
    if (ancestorUserId === descendantUserId)
        return true;
    const chain = await getAncestorChain(organizationId, descendantUserId);
    return chain.some((n) => n.userId === ancestorUserId);
}
/**
 * Every user id below `ancestorUserId` in the primary-manager tree, at any
 * depth (does not include the ancestor themselves). Used to validate/expand
 * a whole task-assignment list in one query instead of walking each
 * candidate's chain individually.
 */
async function getDescendantUserIds(organizationId, ancestorUserId) {
    const nodes = await prisma_1.prisma.hierarchyNode.findMany({ where: { organizationId } });
    const childrenByParentNodeId = new Map();
    nodes.forEach((n) => {
        if (n.parentId == null)
            return;
        const list = childrenByParentNodeId.get(n.parentId) || [];
        list.push(n);
        childrenByParentNodeId.set(n.parentId, list);
    });
    const ancestorNode = nodes.find((n) => n.userId === ancestorUserId);
    if (!ancestorNode)
        return [];
    const result = [];
    const queue = [...(childrenByParentNodeId.get(ancestorNode.id) || [])];
    while (queue.length > 0) {
        const node = queue.shift();
        if (node.userId != null)
            result.push(node.userId);
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
async function getApprover(organizationId, requesterUserId) {
    const chain = await getAncestorChain(organizationId, requesterUserId);
    if (chain.length === 0)
        return null;
    // Role is scoped to this one organization already (see
    // OrganizationMembership), so a plain userId -> role map is unambiguous here.
    const memberships = await prisma_1.prisma.organizationMembership.findMany({ where: { organizationId } });
    const roleByUserId = new Map(memberships.map((m) => [m.userId, m.role]));
    const approver = chain.find((n) => n.userId != null &&
        (roleByUserId.get(n.userId) === enums_1.UserRole.ADMIN ||
            roleByUserId.get(n.userId) === enums_1.UserRole.SUPER_ADMIN));
    return approver?.userId != null ? { userId: approver.userId } : null;
}
/**
 * Whether `actorUserId` may approve/reject a request submitted by
 * `requesterUserId`. A super admin (the account's root) always can, as a
 * fallback so requests never get permanently stuck while the org chart is
 * still being filled in — everyone else must be that requester's nearest
 * admin ancestor.
 */
async function canApprove(organizationId, actorUserId, actorRole, requesterUserId) {
    if (actorRole === enums_1.UserRole.SUPER_ADMIN)
        return true;
    const approver = await getApprover(organizationId, requesterUserId);
    return approver?.userId === actorUserId;
}
//# sourceMappingURL=hierarchyAuthority.js.map