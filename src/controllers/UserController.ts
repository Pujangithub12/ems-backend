import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";
import bcrypt from "bcrypt";
import { In } from "typeorm";
import { UpdateUserDto } from "../dto/user.dto";

// At most one super admin per workspace. `excludeUserId` lets an update check
// exclude the user being updated (a no-op re-save of an existing super admin
// shouldn't trip over itself). Exported for InviteController, which enforces
// the same rule when sending/accepting an invite.
export const countSuperAdminsInWorkspace = async (
  workspaceId: number,
  excludeUserId?: number,
): Promise<number> => {
  const qb = AppDataSource.getRepository(User)
    .createQueryBuilder("user")
    .innerJoin("user.workspaces", "workspace")
    .where("workspace.id = :workspaceId", { workspaceId })
    .andWhere("user.role = :role", { role: UserRole.SUPER_ADMIN });
  if (excludeUserId !== undefined) {
    qb.andWhere("user.id != :excludeUserId", { excludeUserId });
  }
  return qb.getCount();
};

export class UserController {
  static getAllUsers = async (req: AuthRequest, res: Response) => {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const workspace = req.workspace!;

      // Get all users that are members of the current workspace
      const users = await userRepository
        .createQueryBuilder("user")
        .innerJoin("user.workspaces", "workspace")
        .where("workspace.id = :workspaceId", { workspaceId: workspace.id })
        .select([
          "user.id",
          "user.fullName",
          "user.email",
          "user.phoneNumber",
          "user.address",
          "user.jobPosition",
          "user.joinDate",
          "user.role",
          "user.createdAt",
        ])
        .getMany();

      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteUser = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const workspace = req.workspace!;

      // Find user only if they are in current workspace
      const user = await userRepository
        .createQueryBuilder("user")
        .innerJoin("user.workspaces", "workspace")
        .where("user.id = :id", { id: parseInt(id as string) })
        .andWhere("workspace.id = :workspaceId", { workspaceId: workspace.id })
        .getOne();

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Admins can remove regular users/finance, but not peers or super admins
      // — only a super admin can remove another admin (or a user).
      const currentUserRole = req.user?.role;
      if (
        currentUserRole === UserRole.ADMIN &&
        (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN)
      ) {
        return res.status(403).json({
          message: "Admins cannot remove other admins or super admins",
        });
      }

      // Remove user from workspace
      await userRepository
        .createQueryBuilder()
        .relation(User, "workspaces")
        .of(user)
        .remove(workspace);

      return res
        .status(200)
        .json({ message: "User removed from workspace successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateUser = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      fullName,
      email,
      password,
      phoneNumber,
      address,
      jobPosition,
      joinDate,
      role,
    }: UpdateUserDto = req.body;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const workspace = req.workspace!;

      // Find user only if they are in current workspace
      const user = await userRepository
        .createQueryBuilder("user")
        .innerJoin("user.workspaces", "workspace")
        .where("user.id = :id", { id: parseInt(id as string) })
        .andWhere("workspace.id = :workspaceId", { workspaceId: workspace.id })
        .getOne();

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (fullName) user.fullName = fullName;
      if (email) user.email = email;
      if (phoneNumber) user.phoneNumber = phoneNumber;
      if (address) user.address = address;
      if (jobPosition) user.jobPosition = jobPosition;
      if (joinDate) user.joinDate = new Date(joinDate);

      // Enforce role update rules
      const currentUserRole = req.user?.role;
      if (role) {
        if (currentUserRole === UserRole.ADMIN) {
          // Admin can set role to user, finance, or admin, but not super admin
          if (
            role === UserRole.USER ||
            role === UserRole.FINANCE ||
            role === UserRole.ADMIN
          ) {
            user.role = role as UserRole;
          }
        } else if (currentUserRole === UserRole.SUPER_ADMIN) {
          // Super admin can set any role, but only one super admin is
          // allowed per workspace.
          if (role === UserRole.SUPER_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
            const existingSuperAdmins = await countSuperAdminsInWorkspace(
              workspace.id,
              user.id,
            );
            if (existingSuperAdmins > 0) {
              return res
                .status(400)
                .json({ message: "This workspace already has a super admin" });
            }
          }
          user.role = role as UserRole;
        }
        // Regular users can't change roles
      }

      if (password) {
        user.password = await bcrypt.hash(password, 10);
      }

      await userRepository.save(user);

      return res.status(200).json({ message: "User updated successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
