import { Response } from "express";
import { prisma } from "../config/prisma";
import { deleteFilesFromStorage } from "../config/supabaseStorage";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateOrganizationDto,
  SwitchOrganizationDto,
  UpdateOrganizationDto,
  DeleteOrganizationDto,
  GrantMemberAccessDto,
} from "../dto/organization.dto";
import { roleHasPermission } from "../utils/permissionService";
import { toSimpleArray } from "../utils/simpleArray";
import { countSuperAdminsInOrganization } from "./UserController";

export class OrganizationController {
  // Get all organizations for the current user
  static async getAll(req: any, res: Response) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { memberships: { include: { organization: true } } },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res
        .status(200)
        .json({ organizations: user.memberships.map((m) => m.organization) });
    } catch (error) {
      console.error("Error fetching organizations:", error);
      return res.status(500).json({ message: "Failed to fetch organizations" });
    }
  }

  // Create a new organization — the creator becomes its super admin. Any
  // account may do this now, including one with homeOrganizationId set: gaining
  // a second organization unlocks the normal organization switcher for them, the
  // same way grantMemberAccess/InviteController already unlock an invited
  // account once it gains access to more than one organization.
  static async create(req: any, res: Response) {
    try {
      const { name, description, address, contact, email, website }: CreateOrganizationDto = req.body;
      if (!name) {
        return res.status(400).json({ message: "Organization name is required" });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const organization = await prisma.organization.create({
        data: {
          name,
          ...(description !== undefined ? { description } : {}),
          ...(address !== undefined ? { address } : {}),
          ...(contact !== undefined ? { contact } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(website !== undefined ? { website } : {}),
        },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: UserRole.SUPER_ADMIN,
        },
      });

      if (user.homeOrganizationId != null) {
        await prisma.user.update({
          where: { id: user.id },
          data: { homeOrganizationId: null },
        });
      }

      return res.status(201).json({ organization });
    } catch (error) {
      console.error("Error creating organization:", error);
      return res.status(500).json({ message: "Failed to create organization" });
    }
  }

  // Switch to a organization (sets it in cookie) — just needs a membership row
  // for (user, organization) to exist. A home-pinned account (homeOrganizationId
  // still set) only ever has the one membership, so this alone already
  // keeps them from switching anywhere else; nothing extra to check.
  static async switch(req: any, res: Response) {
    try {
      const { organizationId }: SwitchOrganizationDto = req.body;
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      const membership = await prisma.organizationMembership.findFirst({
        where: {
          userId: req.user.id,
          organizationId: Number(organizationId),
        },
      });
      if (!membership) {
        return res
          .status(403)
          .json({ message: "Access denied to this organization" });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: Number(organizationId) },
      });
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Set organization in cookie
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("workspaceId", organizationId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return res.status(200).json({ organization });
    } catch (error) {
      console.error("Error switching organization:", error);
      return res.status(500).json({ message: "Failed to switch organization" });
    }
  }

  // Get the organization authMiddleware already resolved for this request
  // (X-Organization-Id header if present, otherwise the organizationId cookie —
  // including its default-organization-creation fallback either way).
  static async getCurrent(req: AuthRequest, res: Response) {
    return res.status(200).json({ organization: req.organization });
  }

  // Rename / update a organization's details
  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, address, contact, email, website }: UpdateOrganizationDto = req.body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: "Organization name is required" });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: Number(id) },
      });

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const isMember = await prisma.organizationMembership.findFirst({
        where: { organizationId: organization.id, userId: req.user!.id },
      });
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }
      if (!(await roleHasPermission(req.user!.role, "workspace.manage"))) {
        return res
          .status(403)
          .json({ message: "Only an admin can edit this organization" });
      }

      const updatedOrganization = await prisma.organization.update({
        where: { id: organization.id },
        data: {
          name: String(name).trim(),
          ...(description !== undefined ? { description } : {}),
          ...(address !== undefined ? { address } : {}),
          ...(contact !== undefined ? { contact } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(website !== undefined ? { website } : {}),
        },
      });

      return res.status(200).json({ organization: updatedOrganization });
    } catch (error) {
      console.error("Error updating organization:", error);
      return res.status(500).json({ message: "Failed to update organization" });
    }
  }

  // Permanently delete a organization and everything scoped to it
  static async remove(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { confirmName }: DeleteOrganizationDto = req.body;
      const organizationId = Number(id);

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const isMember = await prisma.organizationMembership.findFirst({
        where: { organizationId, userId: req.user!.id },
      });
      if (!isMember) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }
      if (!(await roleHasPermission(req.user!.role, "workspace.manage"))) {
        return res
          .status(403)
          .json({ message: "Only an admin can delete this organization" });
      }
      if (!confirmName || confirmName !== organization.name) {
        return res
          .status(400)
          .json({ message: "Organization name confirmation does not match" });
      }

      // Clean up storage objects that the DB cascade won't touch.
      const projectFiles = await prisma.projectFile.findMany({
        where: { organizationId, isFolder: false },
      });
      const projectFileKeys = projectFiles
        .map((f) => f.path)
        .filter((p): p is string => !!p);

      const tasks = await prisma.task.findMany({
        where: { organizationId },
      });
      // Task attachment paths are stored with the "uploads/" prefix still
      // attached (see TaskController) — strip it to get the storage key,
      // matching every other file type's key format.
      const taskFileKeys = tasks.flatMap((t) =>
        toSimpleArray(t.files).map((filePath) => filePath.replace(/^uploads\//, "")),
      );

      deleteFilesFromStorage([...projectFileKeys, ...taskFileKeys]);

      // The organization FK on Project/Task/Announcement/LeaveRequest/MyTask/
      // CalendarEvent/HierarchyNode/OrganizationMembership all carry ON
      // DELETE CASCADE, so a single delete here removes everything scoped to
      // this organization at the database level.
      await prisma.organization.delete({ where: { id: organizationId } });

      // If the caller was sitting in the organization that just got deleted,
      // move them to another one of their organizations (or clear the cookie so
      // authMiddleware creates a fresh default organization on the next request).
      let nextOrganization = null;
      if (req.organization?.id === organizationId) {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.id },
          include: { memberships: { include: { organization: true } } },
        });
        nextOrganization = user?.memberships?.[0]?.organization ?? null;

        const isProduction = process.env.NODE_ENV === "production";
        if (nextOrganization) {
          res.cookie("workspaceId", nextOrganization.id.toString(), {
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
        .json({ message: "Organization deleted", organization: nextOrganization });
    } catch (error) {
      console.error("Error deleting organization:", error);
      return res.status(500).json({ message: "Failed to delete organization" });
    }
  }

  // The caller's own organizations, plus every distinct member across them
  // (excluding the caller) with which of those organizations each one currently
  // has access to. Powers the Organization settings tab's cross-organization
  // access matrix — scoped to the caller's own organization list only, never
  // anything they aren't themselves a member of.
  static async getAccessMatrix(req: AuthRequest, res: Response) {
    try {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: { memberships: { include: { organization: true } } },
      });
      if (!me) {
        return res.status(404).json({ message: "User not found" });
      }

      const organizations = me.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
      }));
      const organizationIds = organizations.map((w) => w.id);

      const allMemberships =
        organizationIds.length > 0
          ? await prisma.organizationMembership.findMany({
              where: { organizationId: { in: organizationIds } },
              include: { user: true, organization: true },
            })
          : [];

      const employeeMap = new Map<
        number,
        { id: number; fullName: string; email: string; role: string; organizationIds: number[] }
      >();
      for (const m of allMemberships) {
        if (m.user.id === me.id) continue;
        let entry = employeeMap.get(m.user.id);
        if (!entry) {
          entry = {
            id: m.user.id,
            fullName: m.user.fullName,
            email: m.user.email,
            role: m.role,
            organizationIds: [],
          };
          employeeMap.set(m.user.id, entry);
        }
        entry.organizationIds.push(m.organization.id);
      }

      return res.status(200).json({
        organizations,
        employees: Array.from(employeeMap.values()).sort((a, b) =>
          a.fullName.localeCompare(b.fullName),
        ),
      });
    } catch (error) {
      console.error("Error fetching organization access matrix:", error);
      return res.status(500).json({ message: "Failed to fetch organization access" });
    }
  }

  // Grants an existing employee access to one of the caller's own
  // organizations, with the given role — doesn't touch their role or access in
  // any other organization.
  static async grantMemberAccess(req: AuthRequest, res: Response) {
    try {
      const organizationId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(organizationId) || !Number.isInteger(userId)) {
        return res.status(400).json({ message: "Invalid organization or user id" });
      }
      if (userId === req.user!.id) {
        return res.status(400).json({ message: "You can't change your own access" });
      }

      const { role: roleInput }: GrantMemberAccessDto = req.body || {};
      const role = ((roleInput as UserRole) || UserRole.USER) as UserRole;
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const actorMembership = await prisma.organizationMembership.findFirst({
        where: { organizationId, userId: req.user!.id },
      });
      if (!actorMembership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const targetUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const existingMembership = await prisma.organizationMembership.findFirst({
        where: { organizationId, userId },
      });
      if (existingMembership) {
        return res.status(400).json({ message: "This user already has access to this organization" });
      }
      if (role === UserRole.SUPER_ADMIN) {
        const existingSuperAdmins = await countSuperAdminsInOrganization(organizationId);
        if (existingSuperAdmins > 0) {
          return res.status(400).json({ message: "This organization already has a super admin" });
        }
      }

      await prisma.organizationMembership.create({
        data: { userId: targetUser.id, organizationId: organization.id, role },
      });

      // Unlock: an account with access to more than one organization behaves
      // like a self-registered "owner" account and gets the normal
      // organization switcher, instead of staying pinned to a single home
      // organization (see authMiddleware's homeOrganizationId check).
      if (targetUser.homeOrganizationId != null) {
        await prisma.user.update({
          where: { id: targetUser.id },
          data: { homeOrganizationId: null },
        });
      }

      return res.status(200).json({ message: "Access granted" });
    } catch (error) {
      console.error("Error granting organization access:", error);
      return res.status(500).json({ message: "Failed to grant access" });
    }
  }

  // Revokes an employee's access to one of the caller's own organizations —
  // removes membership only; the account itself, and its access to any
  // other organization, is untouched.
  static async revokeMemberAccess(req: AuthRequest, res: Response) {
    try {
      const organizationId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(organizationId) || !Number.isInteger(userId)) {
        return res.status(400).json({ message: "Invalid organization or user id" });
      }
      if (userId === req.user!.id) {
        return res.status(400).json({ message: "You can't change your own access" });
      }

      const actorMembership = await prisma.organizationMembership.findFirst({
        where: { organizationId, userId: req.user!.id },
      });
      if (!actorMembership) {
        return res.status(403).json({ message: "Not a member of this organization" });
      }

      const targetUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const targetMembership = await prisma.organizationMembership.findFirst({
        where: { organizationId, userId },
      });
      if (!targetMembership) {
        return res.status(400).json({ message: "This user doesn't have access to this organization" });
      }

      const targetMembershipCount = await prisma.organizationMembership.count({
        where: { userId },
      });
      if (targetMembershipCount <= 1) {
        return res.status(400).json({
          message:
            "This is their only organization — remove them from Users instead if you want to revoke all access.",
        });
      }

      await prisma.organizationMembership.delete({ where: { id: targetMembership.id } });

      if (targetUser.homeOrganizationId === organizationId) {
        await prisma.user.update({
          where: { id: targetUser.id },
          data: { homeOrganizationId: null },
        });
      }

      return res.status(200).json({ message: "Access revoked" });
    } catch (error) {
      console.error("Error revoking organization access:", error);
      return res.status(500).json({ message: "Failed to revoke access" });
    }
  }
}
