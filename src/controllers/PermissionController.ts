import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { isPermissionKey, isPermissionRole } from "../config/permissions";
import { getPermissionMatrix } from "../utils/permissionService";
import { UpdatePermissionsDto } from "../dto/permission.dto";

export class PermissionController {
  // Any authenticated user can view the matrix — the Roles & Permissions
  // tab is visible (read-only for non-admins) to everyone.
  static getMatrix = async (_req: AuthRequest, res: Response) => {
    try {
      const permissions = await getPermissionMatrix();
      return res.status(200).json({ permissions });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  // Route is gated to super_admin only in routes.ts — not by a toggleable
  // permission, so a super admin can never accidentally lock themselves out.
  static updateMatrix = async (req: AuthRequest, res: Response) => {
    const { updates }: UpdatePermissionsDto = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: "updates array is required" });
    }

    try {
      for (const update of updates) {
        if (
          !update ||
          !isPermissionRole(update.role) ||
          !isPermissionKey(update.permissionKey)
        ) {
          continue;
        }

        await prisma.rolePermission.upsert({
          where: {
            role_permissionKey: { role: update.role, permissionKey: update.permissionKey },
          },
          update: { granted: !!update.granted },
          create: {
            role: update.role,
            permissionKey: update.permissionKey,
            granted: !!update.granted,
          },
        });
      }

      const permissions = await getPermissionMatrix();
      return res.status(200).json({ permissions });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
