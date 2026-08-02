import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import { CreateInviteDto, AcceptInviteDto } from "../dto/invite.dto";
import { sendEmail } from "../utils/emailService";
import { countSuperAdminsInOrganization } from "./UserController";
import { getPasswordStrengthError } from "../utils/passwordPolicy";
import { JWT_SECRET } from "../config/jwt";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Find-or-create this user's hierarchy node in the organization — mirrors the
// same auto-heal HierarchyController.getHierarchy does, so a node always
// exists to attach a manager to (or be attached under one) on demand.
const ensureHierarchyNode = async (userId: number, organizationId: number) => {
  let node = await prisma.hierarchyNode.findFirst({ where: { userId, organizationId } });
  if (!node) {
    node = await prisma.hierarchyNode.create({ data: { userId, organizationId } });
  }
  return node;
};

// Places a newly-invited member under whoever invited them in the organization's
// org chart, so they immediately show up in the inviter's "Assigned To"
// picker instead of requiring a manual Settings > Hierarchy edit. Skipped if
// we don't know who invited them (legacy invite rows) or the invitee is the
// organization's super admin, who always stays at the root.
const placeUnderInviter = async (
  inviterUserId: number | null | undefined,
  inviteeUserId: number,
  inviteeRole: UserRole,
  organizationId: number,
) => {
  if (inviterUserId == null || inviteeRole === UserRole.SUPER_ADMIN) return;
  const inviterNode = await ensureHierarchyNode(inviterUserId, organizationId);
  const inviteeNode = await ensureHierarchyNode(inviteeUserId, organizationId);
  await prisma.hierarchyNode.update({
    where: { id: inviteeNode.id },
    data: { parentId: inviterNode.id },
  });
};
// Falls back by NODE_ENV (not just a single hardcoded default) so a missing
// FRONTEND_URL env var still points production invite emails at the deployed
// frontend instead of localhost.
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://www.jdnenergy.com.np"
    : "http://localhost:5173");

export class InviteController {
  // Admin/super admin action ("Invite Members"): creates a pending invite and
  // emails an accept link, instead of creating the User row directly. No
  // account exists until the invitee opens the link and sets their own
  // password — see acceptInvite below.
  static sendInvite = async (req: AuthRequest, res: Response) => {
    const { fullName, email, role }: CreateInviteDto = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    try {
      const organization = req.organization!;
      const normalizedEmail = email.trim();

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      // Enforce role assignment rules (identical to the old direct-create
      // flow: admins can't invite a super admin; only one super admin/organization).
      const currentUserRole = req.user?.role;
      let finalRole = (role as UserRole) || UserRole.USER;

      if (currentUserRole === UserRole.ADMIN) {
        if (
          finalRole === UserRole.USER ||
          finalRole === UserRole.FINANCE ||
          finalRole === UserRole.ADMIN
        ) {
          // Keep the requested role (user, finance, or admin)
        } else {
          finalRole = UserRole.USER;
        }
      } else if (currentUserRole !== UserRole.SUPER_ADMIN) {
        return res
          .status(403)
          .json({ message: "Not authorized to invite members" });
      }

      if (finalRole === UserRole.SUPER_ADMIN) {
        const existingSuperAdmins = await countSuperAdminsInOrganization(organization.id);
        if (existingSuperAdmins > 0) {
          return res
            .status(400)
            .json({ message: "This organization already has a super admin" });
        }
      }

      if (existingUser) {
        // This email already has an account — created either by this same
        // person self-registering, or by a completely unrelated organization's
        // admin inviting them. Rather than blocking the invite, add them as
        // a member of *this* organization too: same login, now shows up in
        // their organization switcher alongside any others (exactly like a
        // self-registered "owner" account already can belong to several
        // organizations). No new password/accept-invite step is needed since
        // the account already exists.
        const alreadyMember = await prisma.organizationMembership.findFirst({
          where: { organizationId: organization.id, userId: existingUser.id },
        });
        if (alreadyMember) {
          return res
            .status(400)
            .json({ message: "This user is already a member of this organization" });
        }

        const fullOrganization = await prisma.organization.findUnique({
          where: { id: organization.id },
        });
        if (!fullOrganization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        // Only creates a membership in *this* organization — the invited
        // user's role in any other organization they already belong to is
        // untouched (previously `existingUser.role = finalRole` clobbered
        // their role everywhere, since role was a single global column).
        await prisma.organizationMembership.create({
          data: {
            userId: existingUser.id,
            organizationId: fullOrganization.id,
            role: finalRole,
          },
        });

        // Unlock: once an account belongs to more than one organization it
        // behaves like a self-registered "owner" account and gets the
        // normal organization switcher, instead of staying pinned to a single
        // home organization (see authMiddleware's homeOrganizationId check).
        if (existingUser.homeOrganizationId != null) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { homeOrganizationId: null },
          });
        }

        await placeUnderInviter(req.user?.id, existingUser.id, finalRole, organization.id);

        const roleText = finalRole.replace("_", " ");
        await sendEmail(
          [normalizedEmail],
          `You've been added to ${organization.name} on EMS`,
          `Hi ${existingUser.fullName},\n\nYou've been added to ${organization.name} on EMS as ${roleText}.\n\nLog in with your existing account and use the organization switcher to access it.`,
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">You've been added to ${organization.name} on EMS</h2>
            <p style="color: #555; line-height: 1.6;">
              Hi ${existingUser.fullName},<br /><br />
              You've been added to <strong>${organization.name}</strong> on EMS as <strong>${roleText}</strong>.
              Log in with your existing account and use the organization switcher to access it.
            </p>
          </div>
          `,
          "organization-added",
        );

        return res.status(200).json({ message: "Existing user added to organization" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      // One live invite per email — resending overwrites the previous token.
      await prisma.organizationInvite.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          fullName,
          role: finalRole,
          organizationId: organization.id,
          invitedByUserId: req.user?.id ?? null,
          token,
          expiresAt,
        },
        update: {
          fullName,
          role: finalRole,
          organizationId: organization.id,
          invitedByUserId: req.user?.id ?? null,
          token,
          expiresAt,
        },
      });

      const acceptUrl = `${FRONTEND_URL}/accept-invite?token=${token}`;
      const roleText = finalRole.replace("_", " ");
      const inviteHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">You're invited to join ${organization.name} on EMS</h2>
          <p style="color: #555; line-height: 1.6;">
            Hi ${fullName},<br /><br />
            You've been invited to join <strong>${organization.name}</strong> on EMS as <strong>${roleText}</strong>.
          </p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${acceptUrl}" style="background: #1E3A8A; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; display: inline-block;">
              Accept Invite
            </a>
          </p>
          <p style="color: #999; font-size: 12px;">This invite link expires in 7 days.</p>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px;">
            This email was sent by EMS Management. If you have questions, please contact your administrator.
          </p>
        </div>
      `;
      const sent = await sendEmail(
        [normalizedEmail],
        `You're invited to join ${organization.name} on EMS`,
        `Hi ${fullName},\n\nYou've been invited to join ${organization.name} on EMS as ${roleText}.\n\nAccept your invite: ${acceptUrl}\n\nThis link expires in 7 days.`,
        inviteHtml,
        "invite",
      );
      if (!sent) {
        return res.status(502).json({
          message: "Failed to send the invite email. Please try again.",
        });
      }

      return res.status(200).json({ message: "Invitation sent" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // Public — the invitee isn't logged in yet. Just enough to render the
  // accept screen without exposing anything sensitive.
  static getInvite = async (req: Request, res: Response) => {
    const token = req.params.token as string;

    try {
      const invite = await prisma.organizationInvite.findUnique({ where: { token } });
      if (!invite) {
        return res
          .status(404)
          .json({ message: "Invite not found or already used" });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        return res
          .status(400)
          .json({ message: "This invite has expired. Ask for a new one." });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: invite.organizationId },
      });

      return res.status(200).json({
        invite: {
          fullName: invite.fullName,
          email: invite.email,
          role: invite.role,
        },
        organization: { name: organization?.name || "this organization" },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // Public — creates the real User + adds them to the invite's organization,
  // then logs them straight in (same cookie pattern as
  // AuthController.registerVerify).
  static acceptInvite = async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const { password, phoneNumber, address, jobPosition }: AcceptInviteDto = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }
    const passwordError = getPasswordStrengthError(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }
    if (!phoneNumber || !address || !jobPosition) {
      return res.status(400).json({
        message: "Phone number, address, and job position are required",
      });
    }

    try {
      const invite = await prisma.organizationInvite.findUnique({ where: { token } });
      if (!invite) {
        return res
          .status(404)
          .json({ message: "Invite not found or already used" });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        await prisma.organizationInvite.delete({ where: { id: invite.id } });
        return res
          .status(400)
          .json({ message: "This invite has expired. Ask for a new one." });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: invite.email },
      });
      if (existingUser) {
        // Only reachable via a race (the email self-registered elsewhere
        // between invite-sent and invite-accepted — sendInvite already
        // blocks inviting an email that already has an account). Leave the
        // invite intact rather than deleting it: log in with the existing
        // account instead, then ask your admin to resend the invite so it
        // can be accepted correctly.
        return res.status(400).json({
          message:
            "An account with this email already exists. Log in with that account, then ask your admin to resend the invite.",
        });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: invite.organizationId },
      });
      if (!organization) {
        await prisma.organizationInvite.delete({ where: { id: invite.id } });
        return res.status(404).json({ message: "Organization no longer exists" });
      }

      // Re-check in case the organization's super admin situation changed since
      // the invite was sent (e.g. someone else was promoted in the meantime).
      if (invite.role === UserRole.SUPER_ADMIN) {
        const existingSuperAdmins = await countSuperAdminsInOrganization(organization.id);
        if (existingSuperAdmins > 0) {
          return res.status(400).json({
            message:
              "This organization already has a super admin. Contact your admin.",
          });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          fullName: invite.fullName,
          email: invite.email,
          password: hashedPassword,
          phoneNumber,
          address,
          jobPosition,
          // Not asked for — the invitee is joining right now, so today is
          // always the correct join date.
          joinDate: new Date(),
          // Permanently locks this account to the organization it was invited
          // into — see authMiddleware and OrganizationController.create/switch.
          homeOrganizationId: organization.id,
        },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: invite.role,
        },
      });

      await placeUnderInviter(
        invite.invitedByUserId,
        user.id,
        invite.role as UserRole,
        organization.id,
      );

      await prisma.organizationInvite.delete({ where: { id: invite.id } });

      // Role is per-organization now (see OrganizationMembership), so it can't be
      // baked into a token that outlives any single organization context.
      const jwtToken = jwt.sign({ id: user.id }, JWT_SECRET, {
        expiresIn: "3h",
      });
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", jwtToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: THREE_HOURS_MS,
      });
      res.cookie("workspaceId", organization.id.toString(), {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({
        message: "Account created successfully",
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          address: user.address,
          jobPosition: user.jobPosition,
          joinDate: user.joinDate,
          createdAt: user.createdAt,
          homeOrganizationId: user.homeOrganizationId,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          description: organization.description,
          createdAt: organization.createdAt,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
