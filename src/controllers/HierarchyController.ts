import { Response } from "express";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import { HierarchyPersonDto, SaveHierarchyDto } from "../dto/hierarchy.dto";

const HIERARCHY_INCLUDE = {
  user: true,
  secondaryManagers: { include: { node2: true } },
} as const;

const toDto = (
  node: any,
  roleByUserId: Map<number, string>,
): HierarchyPersonDto => ({
  id: node.id,
  userId: node.userId!,
  fullName: node.user!.fullName,
  email: node.user!.email,
  jobPosition: node.user!.jobPosition,
  role: roleByUserId.get(node.userId!) ?? UserRole.USER,
  joinDate: node.user!.joinDate as unknown as string,
  primaryManagerId: node.parentId ?? null,
  secondaryManagerIds: (node.secondaryManagers || []).map((sm: any) => sm.node2.id),
});

export class HierarchyController {
  // Every organization member always has exactly one node — this reconciles
  // the HierarchyNode table against current membership (creating nodes for
  // new members, dropping nodes for members removed from the organization)
  // before returning, so callers never see it out of sync.
  static async getHierarchy(req: AuthRequest, res: Response) {
    try {
      const organizationId = req.organization?.id;
      if (!organizationId) {
        return res.status(400).json({ message: "Organization not found" });
      }

      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId },
        include: { user: true },
      });
      const members = memberships.map((m) => m.user);
      const memberIds = new Set(members.map((m) => m.id));
      // Role is scoped to this one organization already, so a plain userId ->
      // role map is unambiguous here (unlike OrganizationController.getAccessMatrix,
      // which spans several organizations at once).
      const roleByUserId = new Map(memberships.map((m) => [m.user.id, m.role]));

      let nodes = await prisma.hierarchyNode.findMany({
        where: { organizationId },
        include: HIERARCHY_INCLUDE,
      });

      // Drop nodes for users no longer in this organization.
      const staleNodes = nodes.filter(
        (n) => n.userId == null || !memberIds.has(n.userId),
      );
      if (staleNodes.length > 0) {
        await prisma.hierarchyNode.deleteMany({
          where: { id: { in: staleNodes.map((n) => n.id) } },
        });
        nodes = nodes.filter((n) => !staleNodes.includes(n));
      }

      // Create nodes for members that don't have one yet.
      const existingUserIds = new Set(nodes.map((n) => n.userId));
      const missing = members.filter((m) => !existingUserIds.has(m.id));
      if (missing.length > 0) {
        await prisma.hierarchyNode.createMany({
          data: missing.map((m) => ({ userId: m.id, organizationId })),
        });
        nodes = await prisma.hierarchyNode.findMany({
          where: { organizationId },
          include: HIERARCHY_INCLUDE,
        });
      }

      // A super admin always sits at the root — self-heal any node that
      // somehow ended up with a manager (e.g. legacy data).
      const misplacedSuperAdmins = nodes.filter(
        (n) =>
          n.userId != null &&
          roleByUserId.get(n.userId) === UserRole.SUPER_ADMIN &&
          n.parentId != null,
      );
      if (misplacedSuperAdmins.length > 0) {
        await prisma.hierarchyNode.updateMany({
          where: { id: { in: misplacedSuperAdmins.map((n) => n.id) } },
          data: { parentId: null },
        });
        misplacedSuperAdmins.forEach((n) => (n.parentId = null));
      }

      const people = nodes
        .map((n) => toDto(n, roleByUserId))
        .sort((a, b) => a.id - b.id);
      return res.status(200).json({ people });
    } catch (error) {
      console.error("Error fetching hierarchy:", error);
      return res.status(500).json({ message: "Failed to fetch hierarchy" });
    }
  }

  // Updates reporting relationships in place (nodes are stable/1:1 with
  // organization members, so unlike Schedule/Project full-replace patterns
  // elsewhere, there's nothing to delete-and-recreate here).
  static async saveHierarchy(req: AuthRequest, res: Response) {
    try {
      const organizationId = req.organization?.id;
      if (!organizationId) {
        return res.status(400).json({ message: "Organization not found" });
      }

      const { people }: SaveHierarchyDto = req.body;
      if (!Array.isArray(people)) {
        return res.status(400).json({ message: "people array is required" });
      }

      const nodes = await prisma.hierarchyNode.findMany({
        where: { organizationId },
        include: { user: true },
      });
      const nodeIds = new Set(nodes.map((n) => n.id));
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId },
      });
      const roleByUserId = new Map(memberships.map((m) => [m.userId, m.role]));

      // Validate every referenced id (self, primary manager, secondary
      // managers) actually belongs to this organization before touching anything.
      for (const p of people) {
        if (!nodeIds.has(p.id)) {
          return res.status(400).json({ message: "Unknown person in hierarchy update" });
        }
        if (p.primaryManagerId !== null && !nodeIds.has(p.primaryManagerId)) {
          return res.status(400).json({ message: "Unknown primary manager referenced" });
        }
        for (const secId of p.secondaryManagerIds || []) {
          if (!nodeIds.has(secId)) {
            return res.status(400).json({ message: "Unknown secondary manager referenced" });
          }
        }
      }

      // A super admin always sits at the root of the hierarchy.
      for (const p of people) {
        const node = nodeById.get(p.id)!;
        if (
          node.userId != null &&
          roleByUserId.get(node.userId) === UserRole.SUPER_ADMIN &&
          p.primaryManagerId !== null
        ) {
          return res.status(400).json({
            message: "A super admin can't be given a manager — they stay at the root",
          });
        }
      }

      // Reject a request that would introduce a primary-manager cycle.
      const nextParent = new Map<number, number | null>();
      nodes.forEach((n) => nextParent.set(n.id, n.parentId ?? null));
      people.forEach((p) => nextParent.set(p.id, p.primaryManagerId));
      for (const id of nextParent.keys()) {
        let cur: number | null | undefined = id;
        for (let steps = 0; steps <= nextParent.size; steps++) {
          cur = cur === undefined || cur === null ? null : nextParent.get(cur) ?? null;
          if (cur === null) break;
          if (cur === id) {
            return res.status(400).json({
              message: "That change would create a reporting-line cycle",
            });
          }
        }
      }

      for (const p of people) {
        await prisma.hierarchyNode.update({
          where: { id: p.id },
          data: {
            parentId: p.primaryManagerId,
            secondaryManagers: {
              deleteMany: {},
              create: (p.secondaryManagerIds || []).map((id) => ({
                hierarchyNodeId_2: id,
              })),
            },
          },
        });
      }

      const updated = await prisma.hierarchyNode.findMany({
        where: { organizationId },
        include: HIERARCHY_INCLUDE,
      });
      const result = updated
        .map((n) => toDto(n, roleByUserId))
        .sort((a, b) => a.id - b.id);
      return res.status(200).json({ people: result });
    } catch (error) {
      console.error("Error saving hierarchy:", error);
      return res.status(500).json({ message: "Failed to save hierarchy" });
    }
  }
}
