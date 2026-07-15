import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AppDataSource } from "../config/data-source";
import { Workspace } from "../entities/Workspace";
import { User, UserRole } from "../entities/User";
import { WorkspaceMembership } from "../entities/WorkspaceMembership";
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
    // The JWT only ever carries the user id now — role is per-workspace (see
    // WorkspaceMembership), so it can't be baked into a token that outlives
    // any single workspace context. `req.user.role` is filled in below once
    // `req.workspace` is resolved.
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    req.user = {
      id: decoded.id,
      role: "",
    };

    const workspaceRepo = AppDataSource.getRepository(Workspace);
    const userRepo = AppDataSource.getRepository(User);
    const membershipRepo = AppDataSource.getRepository(WorkspaceMembership);

    const user = await userRepo.findOne({
      where: { id: req.user.id },
      relations: ["memberships", "memberships.workspace"],
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const userWorkspaces = user.memberships.map((m) => m.workspace);

    const headerWorkspaceId = req.headers["x-workspace-id"];
    const rawHeader = Array.isArray(headerWorkspaceId)
      ? headerWorkspaceId[0]
      : headerWorkspaceId;

    let resolvedWorkspace: Workspace | null = null;

    // Accounts created via an accepted workspace invite are permanently
    // pinned to the one workspace they were invited into — resolved here,
    // before any header/cookie logic, so nothing below can ever put them in
    // a different workspace's context.
    if (user.homeWorkspaceId != null) {
      const home = userWorkspaces.find((w) => w.id === user.homeWorkspaceId);
      if (!home) {
        // Home workspace was deleted, or this account's membership in it was
        // otherwise removed — never fall through to the "no workspace ->
        // create a default one" path below, which would hand a restricted
        // account a workspace of its own.
        return res
          .status(403)
          .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
      }

      const requestedId =
        rawHeader != null
          ? Number(rawHeader)
          : req.cookies.workspaceId
            ? Number(req.cookies.workspaceId)
            : null;
      if (
        requestedId != null &&
        Number.isInteger(requestedId) &&
        requestedId !== home.id
      ) {
        return res
          .status(403)
          .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
      }

      resolvedWorkspace = home;
    } else if (headerWorkspaceId) {
      // The frontend is URL-driven: each request declares which workspace
      // it's operating on via this header (derived from the route, not
      // shared cookie state), so switching workspaces takes effect on the
      // very next request instead of racing a cookie update. Falls back to
      // the cookie below for requests that can't set custom headers (e.g.
      // the static /uploads route).
      const parsedId = Number(rawHeader);
      if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return res.status(400).json({ message: "Invalid workspace id" });
      }

      const targetWorkspace = userWorkspaces.find((w) => w.id === parsedId);
      if (!targetWorkspace) {
        return res
          .status(403)
          .json({ message: "Not a member of this workspace" });
      }

      resolvedWorkspace = targetWorkspace;
    } else {
      // Now get the current workspace
      const workspaceId = req.cookies.workspaceId;

      if (!workspaceId) {
        if (userWorkspaces.length === 0) {
          // Brand new account with no workspace at all — create a default
          // one and make them its super admin (mirrors
          // WorkspaceController.create / AuthController.registerVerify).
          const defaultWorkspace = workspaceRepo.create({
            name: "EMS Workspace",
          });
          await workspaceRepo.save(defaultWorkspace);
          const membership = membershipRepo.create({
            user,
            workspace: defaultWorkspace,
            role: UserRole.SUPER_ADMIN,
          });
          await membershipRepo.save(membership);
          user.memberships.push(membership);
          resolvedWorkspace = defaultWorkspace;
        } else {
          resolvedWorkspace = userWorkspaces[0]!;
        }
      } else {
        // Get workspace from cookie — re-verified against this user's actual
        // memberships on every request. The cookie is client-controlled, so
        // trusting its id alone would let anyone read/write another
        // workspace's data just by setting workspaceId to its id.
        const cookieWorkspace = userWorkspaces.find(
          (w) => w.id === Number(workspaceId),
        );

        if (!cookieWorkspace) {
          // Cookie is stale, invalid, or points to a workspace this user is
          // no longer (or never was) a member of — fall back to their first.
          if (userWorkspaces.length > 0) {
            resolvedWorkspace = userWorkspaces[0]!;
          } else {
            return res.status(404).json({ message: "Workspace not found" });
          }
        } else {
          resolvedWorkspace = cookieWorkspace;
        }
      }
    }

    if (!resolvedWorkspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const membership = user.memberships.find(
      (m) => m.workspace.id === resolvedWorkspace!.id,
    );
    if (!membership) {
      // Shouldn't happen — resolvedWorkspace is always derived from
      // userWorkspaces/user.memberships above — but never let a request
      // through with an unresolved role.
      return res
        .status(403)
        .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
    }

    req.user.role = membership.role;
    req.workspace = resolvedWorkspace;

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("workspaceId", resolvedWorkspace.id.toString(), {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: THREE_HOURS_MS,
    });

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
