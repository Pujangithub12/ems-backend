import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { AppDataSource } from "../config/data-source";
import { Workspace } from "../entities/Workspace";
import { User } from "../entities/User";
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

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

const isWorkspaceAdmin = (role?: string) =>
  role === "admin" || role === "super_admin";

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
      if (!isWorkspaceAdmin(req.user!.role)) {
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
      if (!isWorkspaceAdmin(req.user!.role)) {
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
}
