import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Workspace } from "../entities/Workspace";
import { User } from "../entities/User";
import jwt from "jsonwebtoken";

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
      const { name, description } = req.body;
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
        description,
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
      const { workspaceId } = req.body;
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

  // Get current workspace from cookie
  static async getCurrent(req: any, res: Response) {
    try {
      const workspaceId = req.cookies.workspaceId;
      if (!workspaceId) {
        // If no workspace cookie, try to get the user's first workspace
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOne({
          where: { id: req.user.id },
          relations: ["workspaces"],
        });

        if (!user || user.workspaces.length === 0) {
          // Create default workspace if none exists
          const workspaceRepo = AppDataSource.getRepository(Workspace);
          const defaultWorkspace = workspaceRepo.create({
            name: "EMS Workspace",
            members: [user!],
          });
          await workspaceRepo.save(defaultWorkspace);

          // Set cookie
          const isProduction = process.env.NODE_ENV === "production";
          res.cookie("workspaceId", defaultWorkspace.id, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 30 * 24 * 60 * 60 * 1000,
          });

          return res.status(200).json({ workspace: defaultWorkspace });
        }

        const firstWorkspace = user.workspaces[0];
        if (!firstWorkspace) {
          return res.status(404).json({ message: "No workspace found" });
        }
        // Set cookie to first workspace
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("workspaceId", firstWorkspace.id, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        return res.status(200).json({ workspace: firstWorkspace });
      }

      const workspaceRepo = AppDataSource.getRepository(Workspace);
      const workspace = await workspaceRepo.findOne({
        where: { id: Number(workspaceId) },
      });

      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      return res.status(200).json({ workspace });
    } catch (error) {
      console.error("Error getting current workspace:", error);
      return res
        .status(500)
        .json({ message: "Failed to get current workspace" });
    }
  }
}
