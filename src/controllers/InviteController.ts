import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { Workspace } from "../entities/Workspace";
import { WorkspaceMembership } from "../entities/WorkspaceMembership";
import { WorkspaceInvite } from "../entities/WorkspaceInvite";
import { HierarchyNode } from "../entities/HierarchyNode";
import { AuthRequest } from "../middlewares/auth";
import { CreateInviteDto, AcceptInviteDto } from "../dto/invite.dto";
import { sendEmail } from "../utils/emailService";
import { ActivityController } from "./ActivityController";
import { ActivityType } from "../entities/Activity";
import { countSuperAdminsInWorkspace } from "./UserController";
import { getPasswordStrengthError } from "../utils/passwordPolicy";

dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET || "your_jwt_secret_key";
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Find-or-create this user's hierarchy node in the workspace — mirrors the
// same auto-heal HierarchyController.getHierarchy does, so a node always
// exists to attach a manager to (or be attached under one) on demand.
const ensureHierarchyNode = async (userId: number, workspaceId: number) => {
  const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);
  let node = await hierarchyRepo.findOne({ where: { userId, workspaceId } });
  if (!node) {
    node = hierarchyRepo.create({ userId, workspaceId });
    await hierarchyRepo.save(node);
  }
  return node;
};

// Places a newly-invited member under whoever invited them in the workspace's
// org chart, so they immediately show up in the inviter's "Assigned To"
// picker instead of requiring a manual Settings > Hierarchy edit. Skipped if
// we don't know who invited them (legacy invite rows) or the invitee is the
// workspace's super admin, who always stays at the root.
const placeUnderInviter = async (
  inviterUserId: number | null | undefined,
  inviteeUserId: number,
  inviteeRole: UserRole,
  workspaceId: number,
) => {
  if (inviterUserId == null || inviteeRole === UserRole.SUPER_ADMIN) return;
  const hierarchyRepo = AppDataSource.getRepository(HierarchyNode);
  const inviterNode = await ensureHierarchyNode(inviterUserId, workspaceId);
  const inviteeNode = await ensureHierarchyNode(inviteeUserId, workspaceId);
  inviteeNode.parentId = inviterNode.id;
  await hierarchyRepo.save(inviteeNode);
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
    const {
      fullName,
      email,
      phoneNumber,
      address,
      jobPosition,
      joinDate,
      role,
    }: CreateInviteDto = req.body;

    if (
      !fullName ||
      !email ||
      !phoneNumber ||
      !address ||
      !jobPosition ||
      !joinDate
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const inviteRepository = AppDataSource.getRepository(WorkspaceInvite);
      const workspaceRepository = AppDataSource.getRepository(Workspace);
      const workspace = req.workspace!;
      const normalizedEmail = email.trim();

      const membershipRepository = AppDataSource.getRepository(WorkspaceMembership);
      const existingUser = await userRepository.findOne({
        where: { email: normalizedEmail },
      });

      // Enforce role assignment rules (identical to the old direct-create
      // flow: admins can't invite a super admin; only one super admin/workspace).
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
        const existingSuperAdmins = await countSuperAdminsInWorkspace(workspace.id);
        if (existingSuperAdmins > 0) {
          return res
            .status(400)
            .json({ message: "This workspace already has a super admin" });
        }
      }

      if (existingUser) {
        // This email already has an account — created either by this same
        // person self-registering, or by a completely unrelated workspace's
        // admin inviting them. Rather than blocking the invite, add them as
        // a member of *this* workspace too: same login, now shows up in
        // their workspace switcher alongside any others (exactly like a
        // self-registered "owner" account already can belong to several
        // workspaces). No new password/accept-invite step is needed since
        // the account already exists.
        const alreadyMember = await membershipRepository.findOne({
          where: { workspace: { id: workspace.id }, user: { id: existingUser.id } },
        });
        if (alreadyMember) {
          return res
            .status(400)
            .json({ message: "This user is already a member of this workspace" });
        }

        const fullWorkspace = await workspaceRepository.findOne({
          where: { id: workspace.id },
        });
        if (!fullWorkspace) {
          return res.status(404).json({ message: "Workspace not found" });
        }

        // Only creates a membership in *this* workspace — the invited
        // user's role in any other workspace they already belong to is
        // untouched (previously `existingUser.role = finalRole` clobbered
        // their role everywhere, since role was a single global column).
        await membershipRepository.save(
          membershipRepository.create({
            user: existingUser,
            workspace: fullWorkspace,
            role: finalRole,
          }),
        );

        // Unlock: once an account belongs to more than one workspace it
        // behaves like a self-registered "owner" account and gets the
        // normal workspace switcher, instead of staying pinned to a single
        // home workspace (see authMiddleware's homeWorkspaceId check).
        if (existingUser.homeWorkspaceId != null) {
          existingUser.homeWorkspaceId = null;
          await userRepository.save(existingUser);
        }

        await placeUnderInviter(req.user?.id, existingUser.id, finalRole, workspace.id);

        await ActivityController.logActivity(
          ActivityType.MEMBER_INVITED,
          `Invited ${existingUser.fullName} to join the workspace as ${finalRole.replace("_", " ")}`,
          undefined,
          req.user?.id,
          workspace,
        );

        const roleText = finalRole.replace("_", " ");
        await sendEmail(
          [normalizedEmail],
          `You've been added to ${workspace.name} on EMS`,
          `Hi ${existingUser.fullName},\n\nYou've been added to ${workspace.name} on EMS as ${roleText}.\n\nLog in with your existing account and use the workspace switcher to access it.`,
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">You've been added to ${workspace.name} on EMS</h2>
            <p style="color: #555; line-height: 1.6;">
              Hi ${existingUser.fullName},<br /><br />
              You've been added to <strong>${workspace.name}</strong> on EMS as <strong>${roleText}</strong>.
              Log in with your existing account and use the workspace switcher to access it.
            </p>
          </div>
          `,
          "workspace-added",
        );

        return res.status(200).json({ message: "Existing user added to workspace" });
      }

      const token = crypto.randomBytes(32).toString("hex");

      // One live invite per email — resending overwrites the previous token.
      let invite = await inviteRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (!invite) {
        invite = inviteRepository.create({ email: normalizedEmail });
      }
      invite.fullName = fullName;
      invite.phoneNumber = phoneNumber;
      invite.address = address;
      invite.jobPosition = jobPosition;
      invite.joinDate = new Date(joinDate);
      invite.role = finalRole;
      invite.workspaceId = workspace.id;
      invite.invitedByUserId = req.user?.id ?? null;
      invite.token = token;
      invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await inviteRepository.save(invite);

      const acceptUrl = `${FRONTEND_URL}/accept-invite?token=${token}`;
      const roleText = finalRole.replace("_", " ");
      const inviteHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">You're invited to join ${workspace.name} on EMS</h2>
          <p style="color: #555; line-height: 1.6;">
            Hi ${fullName},<br /><br />
            You've been invited to join <strong>${workspace.name}</strong> on EMS as <strong>${roleText}</strong>.
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
        `You're invited to join ${workspace.name} on EMS`,
        `Hi ${fullName},\n\nYou've been invited to join ${workspace.name} on EMS as ${roleText}.\n\nAccept your invite: ${acceptUrl}\n\nThis link expires in 7 days.`,
        inviteHtml,
        "invite",
      );
      if (!sent) {
        return res.status(502).json({
          message: "Failed to send the invite email. Please try again.",
        });
      }

      await ActivityController.logActivity(
        ActivityType.MEMBER_INVITED,
        `Invited ${fullName} (${normalizedEmail}) to join the workspace as ${roleText}`,
        undefined,
        req.user?.id,
        workspace,
      );

      return res.status(200).json({ message: "Invitation sent" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  // Public — the invitee isn't logged in yet. Just enough to render the
  // accept screen without exposing anything sensitive.
  static getInvite = async (req: Request, res: Response) => {
    const token = req.params.token as string;

    try {
      const inviteRepository = AppDataSource.getRepository(WorkspaceInvite);
      const workspaceRepository = AppDataSource.getRepository(Workspace);

      const invite = await inviteRepository.findOne({ where: { token } });
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

      const workspace = await workspaceRepository.findOne({
        where: { id: invite.workspaceId },
      });

      return res.status(200).json({
        invite: {
          fullName: invite.fullName,
          email: invite.email,
          jobPosition: invite.jobPosition,
          role: invite.role,
        },
        workspace: { name: workspace?.name || "this workspace" },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  // Public — creates the real User + adds them to the invite's workspace,
  // then logs them straight in (same cookie pattern as
  // AuthController.registerVerify).
  static acceptInvite = async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const { password }: AcceptInviteDto = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }
    const passwordError = getPasswordStrengthError(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    try {
      const inviteRepository = AppDataSource.getRepository(WorkspaceInvite);
      const userRepository = AppDataSource.getRepository(User);
      const workspaceRepository = AppDataSource.getRepository(Workspace);

      const invite = await inviteRepository.findOne({ where: { token } });
      if (!invite) {
        return res
          .status(404)
          .json({ message: "Invite not found or already used" });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        await inviteRepository.remove(invite);
        return res
          .status(400)
          .json({ message: "This invite has expired. Ask for a new one." });
      }

      const existingUser = await userRepository.findOne({
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

      const workspace = await workspaceRepository.findOne({
        where: { id: invite.workspaceId },
      });
      if (!workspace) {
        await inviteRepository.remove(invite);
        return res.status(404).json({ message: "Workspace no longer exists" });
      }

      // Re-check in case the workspace's super admin situation changed since
      // the invite was sent (e.g. someone else was promoted in the meantime).
      if (invite.role === UserRole.SUPER_ADMIN) {
        const existingSuperAdmins = await countSuperAdminsInWorkspace(workspace.id);
        if (existingSuperAdmins > 0) {
          return res.status(400).json({
            message:
              "This workspace already has a super admin. Contact your admin.",
          });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = userRepository.create({
        fullName: invite.fullName,
        email: invite.email,
        password: hashedPassword,
        phoneNumber: invite.phoneNumber,
        address: invite.address,
        jobPosition: invite.jobPosition,
        joinDate: invite.joinDate,
        // Permanently locks this account to the workspace it was invited
        // into — see authMiddleware and WorkspaceController.create/switch.
        homeWorkspaceId: workspace.id,
      });
      await userRepository.save(user);

      const membershipRepository = AppDataSource.getRepository(WorkspaceMembership);
      await membershipRepository.save(
        membershipRepository.create({
          user,
          workspace,
          role: invite.role,
        }),
      );

      await placeUnderInviter(invite.invitedByUserId, user.id, invite.role, workspace.id);

      await inviteRepository.remove(invite);

      // Role is per-workspace now (see WorkspaceMembership), so it can't be
      // baked into a token that outlives any single workspace context.
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
      res.cookie("workspaceId", workspace.id.toString(), {
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
          homeWorkspaceId: user.homeWorkspaceId,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          createdAt: workspace.createdAt,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
