import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { HierarchyNode } from "../entities/HierarchyNode";
import { UserRole } from "../entities/User";
import { WorkspaceMembership } from "../entities/WorkspaceMembership";
import { AuthRequest } from "../middlewares/auth";
import { HierarchyPersonDto, SaveHierarchyDto } from "../dto/hierarchy.dto";

const toDto = (
  node: HierarchyNode,
  roleByUserId: Map<number, UserRole>,
): HierarchyPersonDto => ({
  id: node.id,
  userId: node.userId!,
  fullName: node.user!.fullName,
  email: node.user!.email,
  jobPosition: node.user!.jobPosition,
  role: roleByUserId.get(node.userId!) ?? UserRole.USER,
  joinDate: node.user!.joinDate as unknown as string,
  primaryManagerId: node.parentId ?? null,
  secondaryManagerIds: (node.secondaryManagers || []).map((n) => n.id),
});

export class HierarchyController {
  // Every workspace member always has exactly one node — this reconciles
  // the HierarchyNode table against current membership (creating nodes for
  // new members, dropping nodes for members removed from the workspace)
  // before returning, so callers never see it out of sync.
  static async getHierarchy(req: AuthRequest, res: Response) {
    try {
      const workspaceId = req.workspace?.id;
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace not found" });
      }

      const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);
      const membershipRepo = AppDataSource.getRepository(WorkspaceMembership);

      const memberships = await membershipRepo.find({
        where: { workspace: { id: workspaceId } },
        relations: ["user"],
      });
      const members = memberships.map((m) => m.user);
      const memberIds = new Set(members.map((m) => m.id));
      // Role is scoped to this one workspace already, so a plain userId ->
      // role map is unambiguous here (unlike WorkspaceController.getAccessMatrix,
      // which spans several workspaces at once).
      const roleByUserId = new Map(memberships.map((m) => [m.user.id, m.role]));

      let nodes = await hierarchyRepo.find({
        where: { workspaceId },
        relations: ["user", "secondaryManagers"],
      });

      // Drop nodes for users no longer in this workspace.
      const staleNodes = nodes.filter(
        (n) => n.userId === undefined || !memberIds.has(n.userId),
      );
      if (staleNodes.length > 0) {
        await hierarchyRepo.remove(staleNodes);
        nodes = nodes.filter((n) => !staleNodes.includes(n));
      }

      // Create nodes for members that don't have one yet.
      const existingUserIds = new Set(nodes.map((n) => n.userId));
      const missing = members.filter((m) => !existingUserIds.has(m.id));
      if (missing.length > 0) {
        await hierarchyRepo.save(
          missing.map((m) =>
            hierarchyRepo.create({ userId: m.id, workspaceId }),
          ),
        );
        nodes = await hierarchyRepo.find({
          where: { workspaceId },
          relations: ["user", "secondaryManagers"],
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
        misplacedSuperAdmins.forEach((n) => (n.parentId = null));
        await hierarchyRepo.save(misplacedSuperAdmins);
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
  // workspace members, so unlike Schedule/Project full-replace patterns
  // elsewhere, there's nothing to delete-and-recreate here).
  static async saveHierarchy(req: AuthRequest, res: Response) {
    try {
      const workspaceId = req.workspace?.id;
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace not found" });
      }

      const { people }: SaveHierarchyDto = req.body;
      if (!Array.isArray(people)) {
        return res.status(400).json({ message: "people array is required" });
      }

      const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);
      const membershipRepo = AppDataSource.getRepository(WorkspaceMembership);
      const nodes = await hierarchyRepo.find({
        where: { workspaceId },
        relations: ["user"],
      });
      const nodeIds = new Set(nodes.map((n) => n.id));
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      const memberships = await membershipRepo.find({
        where: { workspace: { id: workspaceId } },
      });
      const roleByUserId = new Map(memberships.map((m) => [m.userId, m.role]));

      // Validate every referenced id (self, primary manager, secondary
      // managers) actually belongs to this workspace before touching anything.
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
        const node = nodeById.get(p.id)!;
        node.parentId = p.primaryManagerId;
        node.secondaryManagers = (p.secondaryManagerIds || [])
          .map((id) => nodeById.get(id)!)
          .filter(Boolean);
        await hierarchyRepo.save(node);
      }

      const updated = await hierarchyRepo.find({
        where: { workspaceId },
        relations: ["user", "secondaryManagers"],
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
