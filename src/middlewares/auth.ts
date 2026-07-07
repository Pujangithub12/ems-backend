import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AppDataSource } from "../config/data-source";
import { Workspace } from "../entities/Workspace";
import { User } from "../entities/User";
import { PermissionKey } from "../config/permissions";
import { roleHasPermission } from "../utils/permissionService";

dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET || "your_jwt_secret_key";
const THREE_HOURS_MS = 3 * 60 * 60 * 1000; 

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
  workspace?: Workspace;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  let token = req.cookies?.token;

  if (!token && authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    const workspaceRepo = AppDataSource.getRepository(Workspace);
    const userRepo = AppDataSource.getRepository(User);

    // The frontend is URL-driven: each request declares which workspace it's
    // operating on via this header (derived from the route, not shared cookie
    // state), so switching workspaces takes effect on the very next request
    // instead of racing a cookie update. Falls back to the cookie below for
    // requests that can't set custom headers (e.g. the static /uploads route).
    const headerWorkspaceId = req.headers["x-workspace-id"];
    if (headerWorkspaceId) {
      const raw = Array.isArray(headerWorkspaceId)
        ? headerWorkspaceId[0]
        : headerWorkspaceId;
      const parsedId = Number(raw);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return res.status(400).json({ message: "Invalid workspace id" });
      }

      const user = await userRepo.findOne({
        where: { id: req.user.id },
        relations: ["workspaces"],
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const targetWorkspace = user.workspaces.find((w) => w.id === parsedId);
      if (!targetWorkspace) {
        return res
          .status(403)
          .json({ message: "Not a member of this workspace" });
      }

      req.workspace = targetWorkspace;

      // Keep the cookie in sync as the "last used" default for requests
      // without the header.
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("workspaceId", targetWorkspace.id.toString(), {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: THREE_HOURS_MS,
      });

      return next();
    }

    // Now get the current workspace
    let workspaceId = req.cookies.workspaceId;

    if (!workspaceId) {
      // Try to get user's first workspace or create default
      const user = await userRepo.findOne({
        where: { id: req.user.id },
        relations: ["workspaces"],
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.workspaces.length === 0) {
        // Create default workspace
        const defaultWorkspace = workspaceRepo.create({
          name: "EMS Workspace",
          members: [user],
        });
        await workspaceRepo.save(defaultWorkspace);
        workspaceId = defaultWorkspace.id.toString();
        // Set cookie
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("workspaceId", workspaceId, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          maxAge: THREE_HOURS_MS, // 3 hours
        });
        req.workspace = defaultWorkspace;
      } else {
        const firstWorkspace = user.workspaces[0];
        if (!firstWorkspace) {
          return res.status(404).json({ message: "Workspace not found" });
        }
        workspaceId = firstWorkspace.id.toString();
        // Set cookie
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("workspaceId", workspaceId, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          maxAge: THREE_HOURS_MS, // 3 hours
        });
        req.workspace = firstWorkspace;
      }
    } else {
      // Get workspace from cookie — re-verified against this user's actual
      // memberships on every request. The cookie is client-controlled, so
      // trusting its id alone would let anyone read/write another
      // workspace's data just by setting workspaceId to its id.
      const user = await userRepo.findOne({
        where: { id: req.user.id },
        relations: ["workspaces"],
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const cookieWorkspace = user.workspaces.find(
        (w) => w.id === Number(workspaceId),
      );

      if (!cookieWorkspace) {
        // Cookie is stale, invalid, or points to a workspace this user is
        // no longer (or never was) a member of — fall back to their first.
        if (user.workspaces.length > 0) {
          const fallbackWorkspace = user.workspaces[0];
          if (!fallbackWorkspace) {
            return res.status(404).json({ message: "Workspace not found" });
          }
          req.workspace = fallbackWorkspace;
          const isProduction = process.env.NODE_ENV === "production";
          res.cookie("workspaceId", fallbackWorkspace.id.toString(), {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: THREE_HOURS_MS, // 3 hours
          });
        } else {
          return res.status(404).json({ message: "Workspace not found" });
        }
      } else {
        req.workspace = cookieWorkspace;
      }
    }

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.clearCookie("token");
    res.clearCookie("workspaceId");
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const roleMiddleware = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log("roleMiddleware:", req.user?.role, roles);
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: Access denied" });
    }
    next();
  };
};

/**
 * Gates a route by a dynamic, DB-backed permission instead of a hardcoded
 * role list — see config/permissions.ts and utils/permissionService.ts.
 * A super admin can grant/revoke these per role from the Roles & Permissions
 * settings tab; this middleware is what actually enforces the change.
 */
export const permissionMiddleware = (key: PermissionKey) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const allowed = await roleHasPermission(req.user.role, key);
    if (!allowed) {
      return res.status(403).json({ message: "Forbidden: Access denied" });
    }
    next();
  };
};

