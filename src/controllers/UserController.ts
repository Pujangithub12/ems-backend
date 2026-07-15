import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { WorkspaceMembership } from "../entities/WorkspaceMembership";
import { AuthRequest } from "../middlewares/auth";
import bcrypt from "bcrypt";
import { UpdateUserDto } from "../dto/user.dto";

// At most one super admin per workspace. `excludeUserId` lets an update check
// exclude the user being updated (a no-op re-save of an existing super admin
// shouldn't trip over itself). Exported for InviteController, which enforces
// the same rule when sending/accepting an invite.
export const countSuperAdminsInWorkspace = async (
  workspaceId: number,
  excludeUserId?: number,
): Promise<number> => {
  const qb = AppDataSource.getRepository(WorkspaceMembership)
    .createQueryBuilder("membership")
    .where("membership.workspaceId = :workspaceId", { workspaceId })
    .andWhere("membership.role = :role", { role: UserRole.SUPER_ADMIN });
  if (excludeUserId !== undefined) {
    qb.andWhere("membership.userId != :excludeUserId", { excludeUserId });
  }
  return qb.getCount();
};

export class UserController {
  static getAllUsers = async (req: AuthRequest, res: Response) => {
    try {
      const workspace = req.workspace!;
      const membershipRepo = AppDataSource.getRepository(WorkspaceMembership);

      // Get all members of the current workspace, with their role in it.
      const memberships = await membershipRepo.find({
        where: { workspace: { id: workspace.id } },
        relations: ["user"],
      });

      const users = memberships.map((m) => ({
        id: m.user.id,
        fullName: m.user.fullName,
        email: m.user.email,
        phoneNumber: m.user.phoneNumber,
        address: m.user.address,
        jobPosition: m.user.jobPosition,
        joinDate: m.user.joinDate,
        role: m.role,
        createdAt: m.user.createdAt,
      }));

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
      const workspace = req.workspace!;
      const membershipRepo = AppDataSource.getRepository(WorkspaceMembership);

      // Find the membership only if they are in the current workspace
      const membership = await membershipRepo.findOne({
        where: {
          user: { id: parseInt(id as string) },
          workspace: { id: workspace.id },
        },
        relations: ["user"],
      });

      if (!membership) {
        return res.status(404).json({ message: "User not found" });
      }

      // Admins can remove regular users/finance, but not peers or super admins
      // — only a super admin can remove another admin (or a user).
      const currentUserRole = req.user?.role;
      if (
        currentUserRole === UserRole.ADMIN &&
        (membership.role === UserRole.ADMIN || membership.role === UserRole.SUPER_ADMIN)
      ) {
        return res.status(403).json({
          message: "Admins cannot remove other admins or super admins",
        });
      }

      // Remove user from workspace (their membership in any other workspace
      // is untouched).
      await membershipRepo.remove(membership);

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
      const membershipRepo = AppDataSource.getRepository(WorkspaceMembership);
      const workspace = req.workspace!;

      // Find the membership (and its user) only if they are in the current
      // workspace — role updates below apply to this membership, i.e. this
      // workspace only.
      const membership = await membershipRepo.findOne({
        where: {
          user: { id: parseInt(id as string) },
          workspace: { id: workspace.id },
        },
        relations: ["user"],
      });

      if (!membership) {
        return res.status(404).json({ message: "User not found" });
      }
      const user = membership.user;

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
            membership.role = role as UserRole;
          }
        } else if (currentUserRole === UserRole.SUPER_ADMIN) {
          // Super admin can set any role, but only one super admin is
          // allowed per workspace.
          if (role === UserRole.SUPER_ADMIN && membership.role !== UserRole.SUPER_ADMIN) {
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
          membership.role = role as UserRole;
        }
        // Regular users can't change roles
      }

      if (password) {
        user.password = await bcrypt.hash(password, 10);
      }

      await userRepository.save(user);
      await membershipRepo.save(membership);

      return res.status(200).json({ message: "User updated successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
