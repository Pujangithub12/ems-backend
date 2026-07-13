import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { AppDataSource } from "../config/data-source";
import { Workspace } from "../entities/Workspace";
import { User, UserRole } from "../entities/User";
import { Task } from "../entities/Task";
import { ProjectFile } from "../entities/ProjectFile";
import { AuthRequest } from "../middlewares/auth";
import jwt from "jsonwebtoken";
import {
  CreateWorkspaceDto,
  SwitchWorkspaceDto,
  UpdateWorkspaceDto,
  DeleteWorkspaceDto,
} from "../dto/workspace.dto";
import { roleHasPermission } from "../utils/permissionService";
import { countSuperAdminsInWorkspace } from "./UserController";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

export class WorkspaceController {
  // Get all workspaces for the current user
  static async getAll(req: any, res: Response) {
    try {
      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: req.user.id },
        relations: ["workspaces"],
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({ workspaces: user.workspaces });
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      return res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  }

  // Create a new workspace
  static async create(req: any, res: Response) {
    try {
      const { name, description }: CreateWorkspaceDto = req.body;
      if (!name) {
        return res.status(400).json({ message: "Workspace name is required" });
      }

      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const userRepo = AppDataSource.getRepository(User);

      const user = await userRepo.findOne({ where: { id: req.user.id } });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.homeWorkspaceId != null) {
        // Accounts created via an accepted workspace invite are permanently
        // pinned to that one workspace — see authMiddleware — and may not
        // own a second one.
        return res
          .status(403)
          .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
      }

      const workspace = workspaceRepo.create({
        name,
        ...(description !== undefined ? { description } : {}),
        members: [user],
      });

      await workspaceRepo.save(workspace);
      return res.status(201).json({ workspace });
    } catch (error) {
      console.error("Error creating workspace:", error);
      return res.status(500).json({ message: "Failed to create workspace" });
    }
  }

  // Switch to a workspace (sets it in cookie)
  static async switch(req: any, res: Response) {
    try {
      const { workspaceId }: SwitchWorkspaceDto = req.body;
      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace ID is required" });
      }

      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const userRepo = AppDataSource.getRepository(User);

      const user = await userRepo.findOne({
        where: { id: req.user.id },
        relations: ["workspaces"],
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.homeWorkspaceId != null && Number(workspaceId) !== user.homeWorkspaceId) {
        // Accounts created via an accepted workspace invite are permanently
        // pinned to that one workspace — see authMiddleware.
        return res
          .status(403)
          .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
      }

      // Verify the user has access to this workspace
      const hasAccess = user.workspaces.some(
        (ws) => ws.id === Number(workspaceId),
      );
      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this workspace" });
      }

      const workspace = await workspaceRepo.findOne({
        where: { id: Number(workspaceId) },
      });
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Set workspace in cookie
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("workspaceId", workspaceId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return res.status(200).json({ workspace });
    } catch (error) {
      console.error("Error switching workspace:", error);
      return res.status(500).json({ message: "Failed to switch workspace" });
    }
  }

  // Get the workspace authMiddleware already resolved for this request
  // (X-Workspace-Id header if present, otherwise the workspaceId cookie —
  // including its default-workspace-creation fallback either way).
  static async getCurrent(req: AuthRequest, res: Response) {
    return res.status(200).json({ workspace: req.workspace });
  }

  // Rename / update a workspace's details
  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description }: UpdateWorkspaceDto = req.body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: "Workspace name is required" });
      }

      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const workspace = await workspaceRepo.findOne({
        where: { id: Number(id) },
        relations: ["members"],
      });

      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const isMember = workspace.members.some((m) => m.id === req.user!.id);
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      if (!(await roleHasPermission(req.user!.role, "workspace.manage"))) {
        return res
          .status(403)
          .json({ message: "Only an admin can edit this workspace" });
      }

      workspace.name = String(name).trim();
      if (description !== undefined) {
        workspace.description = description;
      }
      await workspaceRepo.save(workspace);

      return res.status(200).json({ workspace });
    } catch (error) {
      console.error("Error updating workspace:", error);
      return res.status(500).json({ message: "Failed to update workspace" });
    }
  }

  // Permanently delete a workspace and everything scoped to it
  static async remove(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { confirmName }: DeleteWorkspaceDto = req.body;
      const workspaceId = Number(id);

      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const userRepo = AppDataSource.getRepository(User);

      const workspace = await workspaceRepo.findOne({
        where: { id: workspaceId },
        relations: ["members"],
      });
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const isMember = workspace.members.some((m) => m.id === req.user!.id);
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }
      if (!(await roleHasPermission(req.user!.role, "workspace.manage"))) {
        return res
          .status(403)
          .json({ message: "Only an admin can delete this workspace" });
      }
      if (!confirmName || confirmName !== workspace.name) {
        return res
          .status(400)
          .json({ message: "Workspace name confirmation does not match" });
      }

      // Clean up files on disk that the DB cascade won't touch.
      const projectFileRepo = AppDataSource.getRepository(ProjectFile);
      const projectFiles = await projectFileRepo.find({
        where: { workspace: { id: workspaceId }, isFolder: false },
      });
      projectFiles.forEach((f) => {
        if (f.path) fs.unlink(path.resolve("uploads", f.path), () => {});
      });

      const taskRepo = AppDataSource.getRepository(Task);
      const tasks = await taskRepo.find({
        where: { workspace: { id: workspaceId } },
      });
      tasks.forEach((t) => {
        (t.files || []).forEach((filePath) =>
          fs.unlink(path.resolve(filePath), () => {}),
        );
      });

      // The workspace FK on Project/Task/Announcement/LeaveRequest/MyTask/
      // CalendarEvent/Activity/HierarchyNode (and the members join table) all
      // carry ON DELETE CASCADE, so a single delete here removes everything
      // scoped to this workspace at the database level.
      await workspaceRepo.delete(workspaceId);

      // If the caller was sitting in the workspace that just got deleted,
      // move them to another one of their workspaces (or clear the cookie so
      // authMiddleware creates a fresh default workspace on the next request).
      let nextWorkspace: Workspace | null = null;
      if (req.workspace?.id === workspaceId) {
        const user = await userRepo.findOne({
          where: { id: req.user!.id },
          relations: ["workspaces"],
        });
        nextWorkspace = user?.workspaces?.[0] ?? null;

        const isProduction = process.env.NODE_ENV === "production";
        if (nextWorkspace) {
          res.cookie("workspaceId", nextWorkspace.id.toString(), {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 30 * 24 * 60 * 60 * 1000,
          });
        } else {
          res.clearCookie("workspaceId");
        }
      }

      return res
        .status(200)
        .json({ message: "Workspace deleted", workspace: nextWorkspace });
    } catch (error) {
      console.error("Error deleting workspace:", error);
      return res.status(500).json({ message: "Failed to delete workspace" });
    }
  }

  // The caller's own workspaces, plus every distinct member across them
  // (excluding the caller) with which of those workspaces each one currently
  // has access to. Powers the Workspace settings tab's cross-workspace
  // access matrix — scoped to the caller's own workspace list only, never
  // anything they aren't themselves a member of.
  static async getAccessMatrix(req: AuthRequest, res: Response) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const me = await userRepo.findOne({
        where: { id: req.user!.id },
        relations: ["workspaces", "workspaces.members"],
      });
      if (!me) {
        return res.status(404).json({ message: "User not found" });
      }

      const workspaces = me.workspaces.map((w) => ({ id: w.id, name: w.name }));

      const employeeMap = new Map<
        number,
        { id: number; fullName: string; email: string; role: string; workspaceIds: number[] }
      >();
      for (const w of me.workspaces) {
        for (const m of w.members) {
          if (m.id === me.id) continue;
          let entry = employeeMap.get(m.id);
          if (!entry) {
            entry = { id: m.id, fullName: m.fullName, email: m.email, role: m.role, workspaceIds: [] };
            employeeMap.set(m.id, entry);
          }
          entry.workspaceIds.push(w.id);
        }
      }

      return res.status(200).json({
        workspaces,
        employees: Array.from(employeeMap.values()).sort((a, b) =>
          a.fullName.localeCompare(b.fullName),
        ),
      });
    } catch (error) {
      console.error("Error fetching workspace access matrix:", error);
      return res.status(500).json({ message: "Failed to fetch workspace access" });
    }
  }

  // Grants an existing employee access to one of the caller's own
  // workspaces — adds membership only, doesn't touch their role or their
  // access to any other workspace.
  static async grantMemberAccess(req: AuthRequest, res: Response) {
    try {
      const workspaceId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(workspaceId) || !Number.isInteger(userId)) {
        return res.status(400).json({ message: "Invalid workspace or user id" });
      }
      if (userId === req.user!.id) {
        return res.status(400).json({ message: "You can't change your own access" });
      }

      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const userRepo = AppDataSource.getRepository(User);

      const workspace = await workspaceRepo.findOne({
        where: { id: workspaceId },
        relations: ["members"],
      });
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      if (!workspace.members.some((m) => m.id === req.user!.id)) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const targetUser = await userRepo.findOne({
        where: { id: userId },
        relations: ["workspaces"],
      });
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (targetUser.workspaces.some((w) => w.id === workspaceId)) {
        return res.status(400).json({ message: "This user already has access to this workspace" });
      }
      if (targetUser.role === UserRole.SUPER_ADMIN) {
        const existingSuperAdmins = await countSuperAdminsInWorkspace(workspaceId);
        if (existingSuperAdmins > 0) {
          return res.status(400).json({ message: "This workspace already has a super admin" });
        }
      }

      workspace.members = [...workspace.members, targetUser];
      await workspaceRepo.save(workspace);

      // Unlock: an account with access to more than one workspace behaves
      // like a self-registered "owner" account and gets the normal
      // workspace switcher, instead of staying pinned to a single home
      // workspace (see authMiddleware's homeWorkspaceId check).
      if (targetUser.homeWorkspaceId != null) {
        targetUser.homeWorkspaceId = null;
        await userRepo.save(targetUser);
      }

      return res.status(200).json({ message: "Access granted" });
    } catch (error) {
      console.error("Error granting workspace access:", error);
      return res.status(500).json({ message: "Failed to grant access" });
    }
  }

  // Revokes an employee's access to one of the caller's own workspaces —
  // removes membership only; the account itself, and its access to any
  // other workspace, is untouched.
  static async revokeMemberAccess(req: AuthRequest, res: Response) {
    try {
      const workspaceId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(workspaceId) || !Number.isInteger(userId)) {
        return res.status(400).json({ message: "Invalid workspace or user id" });
      }
      if (userId === req.user!.id) {
        return res.status(400).json({ message: "You can't change your own access" });
      }

      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const userRepo = AppDataSource.getRepository(User);

      const workspace = await workspaceRepo.findOne({
        where: { id: workspaceId },
        relations: ["members"],
      });
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      if (!workspace.members.some((m) => m.id === req.user!.id)) {
        return res.status(403).json({ message: "Not a member of this workspace" });
      }

      const targetUser = await userRepo.findOne({
        where: { id: userId },
        relations: ["workspaces"],
      });
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (!targetUser.workspaces.some((w) => w.id === workspaceId)) {
        return res.status(400).json({ message: "This user doesn't have access to this workspace" });
      }
      if (targetUser.workspaces.length <= 1) {
        return res.status(400).json({
          message:
            "This is their only workspace — remove them from Users instead if you want to revoke all access.",
        });
      }

      await userRepo
        .createQueryBuilder()
        .relation(User, "workspaces")
        .of(targetUser)
        .remove(workspace);

      if (targetUser.homeWorkspaceId === workspaceId) {
        targetUser.homeWorkspaceId = null;
        await userRepo.save(targetUser);
      }

      return res.status(200).json({ message: "Access revoked" });
    } catch (error) {
      console.error("Error revoking workspace access:", error);
      return res.status(500).json({ message: "Failed to revoke access" });
    }
  }
}
