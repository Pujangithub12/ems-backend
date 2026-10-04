import { Response } from "express";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import bcrypt from "bcrypt";
import { UpdateUserDto } from "../dto/user.dto";

// At most one super admin per organization. `excludeUserId` lets an update check
// exclude the user being updated (a no-op re-save of an existing super admin
// shouldn't trip over itself). Exported for InviteController, which enforces
// the same rule when sending/accepting an invite.
export const countSuperAdminsInOrganization = async (
  organizationId: number,
  excludeUserId?: number,
): Promise<number> => {
  return prisma.organizationMembership.count({
    where: {
      organizationId,
      role: UserRole.SUPER_ADMIN,
      ...(excludeUserId !== undefined ? { userId: { not: excludeUserId } } : {}),
    },
  });
};

export class UserController {
  static getAllUsers = async (req: AuthRequest, res: Response) => {
    try {
      const organization = req.organization!;

      // Get all members of the current organization, with their role in it.
      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId: organization.id },
        include: { user: true },
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
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static deleteUser = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    try {
      const organization = req.organization!;

      // Find the membership only if they are in the current organization
      const membership = await prisma.organizationMembership.findFirst({
        where: {
          userId: parseInt(id as string),
          organizationId: organization.id,
        },
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

      // Remove user from organization (their membership in any other organization
      // is untouched).
      await prisma.organizationMembership.delete({ where: { id: membership.id } });

      return res
        .status(200)
        .json({ message: "User removed from organization successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
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
      const organization = req.organization!;

      // Find the membership (and its user) only if they are in the current
      // organization — role updates below apply to this membership, i.e. this
      // organization only.
      const membership = await prisma.organizationMembership.findFirst({
        where: {
          userId: parseInt(id as string),
          organizationId: organization.id,
        },
        include: { user: true },
      });

      if (!membership) {
        return res.status(404).json({ message: "User not found" });
      }
      const user = membership.user;

      const userData: any = {};
      if (fullName) userData.fullName = fullName;
      if (email) userData.email = email;
      if (phoneNumber) userData.phoneNumber = phoneNumber;
      if (address) userData.address = address;
      if (jobPosition) userData.jobPosition = jobPosition;
      if (joinDate) userData.joinDate = new Date(joinDate);

      // Enforce role update rules
      let newRole: string | undefined;
      const currentUserRole = req.user?.role;
      if (role) {
        if (currentUserRole === UserRole.ADMIN) {
          // Admin can set role to user, finance, or admin, but not super admin
          if (
            role === UserRole.USER ||
            role === UserRole.FINANCE ||
            role === UserRole.ADMIN
          ) {
            newRole = role;
          }
        } else if (currentUserRole === UserRole.SUPER_ADMIN) {
          // Super admin can set any role, but only one super admin is
          // allowed per organization.
          if (role === UserRole.SUPER_ADMIN && membership.role !== UserRole.SUPER_ADMIN) {
            const existingSuperAdmins = await countSuperAdminsInOrganization(
              organization.id,
              user.id,
            );
            if (existingSuperAdmins > 0) {
              return res
                .status(400)
                .json({ message: "This organization already has a super admin" });
            }
          }
          newRole = role;
        }
        // Regular users can't change roles
      }

      if (password) {
        userData.password = await bcrypt.hash(password, 10);
      }

      await prisma.user.update({ where: { id: user.id }, data: userData });
      await prisma.organizationMembership.update({
        where: { id: membership.id },
        data: newRole !== undefined ? { role: newRole } : {},
      });

      return res.status(200).json({ message: "User updated successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // Changes a member's role in every organization they share with the caller
  // in one shot, instead of requiring an admin/super admin to switch into each
  // organization and repeat the single-org role change. Only touches
  // memberships in organizations where the caller themselves holds
  // admin/super_admin — their own role there is what decides which roles they
  // may assign, mirroring updateUser's per-organization rules exactly.
  static updateUserRoleEverywhere = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { role }: { role?: string } = req.body;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }
    if (!role || !Object.values(UserRole).includes(role as UserRole)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const userId = parseInt(id as string, 10);
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "You can't change your own role" });
    }

    try {
      // Every organization where the caller themselves is admin/super_admin —
      // the only ones they're allowed to change anyone's role in.
      const callerMemberships = await prisma.organizationMembership.findMany({
        where: {
          userId: req.user!.id,
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
        },
      });
      const callerRoleByOrg = new Map(
        callerMemberships.map((m) => [m.organizationId, m.role as UserRole]),
      );

      if (callerRoleByOrg.size === 0) {
        return res.status(403).json({ message: "Not allowed" });
      }

      const targetMemberships = await prisma.organizationMembership.findMany({
        where: {
          userId,
          organizationId: { in: Array.from(callerRoleByOrg.keys()) },
        },
        include: { organization: true },
      });

      if (targetMemberships.length === 0) {
        return res
          .status(404)
          .json({ message: "This member doesn't share any organization with you" });
      }

      let updatedCount = 0;
      const skippedOrganizations: string[] = [];

      for (const membership of targetMemberships) {
        const callerRole = callerRoleByOrg.get(membership.organizationId);

        if (role === UserRole.SUPER_ADMIN) {
          // Only a super admin can promote someone to super admin, and only
          // one super admin is allowed per organization.
          if (callerRole !== UserRole.SUPER_ADMIN) {
            skippedOrganizations.push(membership.organization.name);
            continue;
          }
          if (membership.role !== UserRole.SUPER_ADMIN) {
            const existingSuperAdmins = await countSuperAdminsInOrganization(
              membership.organizationId,
              userId,
            );
            if (existingSuperAdmins > 0) {
              skippedOrganizations.push(membership.organization.name);
              continue;
            }
          }
        } else if (
          callerRole === UserRole.ADMIN &&
          role !== UserRole.USER &&
          role !== UserRole.FINANCE &&
          role !== UserRole.ADMIN
        ) {
          skippedOrganizations.push(membership.organization.name);
          continue;
        }

        if (membership.role !== role) {
          await prisma.organizationMembership.update({
            where: { id: membership.id },
            data: { role },
          });
        }
        updatedCount++;
      }

      return res.status(200).json({
        message:
          skippedOrganizations.length > 0
            ? `Updated role in ${updatedCount} organization${updatedCount === 1 ? "" : "s"}; couldn't change it in ${skippedOrganizations.join(", ")}`
            : `Updated role in ${updatedCount} organization${updatedCount === 1 ? "" : "s"}`,
        updatedCount,
        skippedOrganizations,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
