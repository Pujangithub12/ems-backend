import { Request, Response } from "express";
import { randomInt } from "crypto";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  LoginDto,
  ChangePasswordDto,
  UpdateMeDto,
  RegisterStartDto,
  RegisterVerifyDto,
  ForgotPasswordStartDto,
  ForgotPasswordResetDto,
} from "../dto/auth.dto";
import { sendEmail } from "../utils/emailService";
import { getPasswordStrengthError } from "../utils/passwordPolicy";
import { JWT_SECRET } from "../config/jwt";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

// Cryptographically strong 6-digit OTP (crypto.randomInt is a CSPRNG, unlike Math.random).
const generateOtp = (): string => randomInt(100000, 1000000).toString();

export class AuthController {
  static login = async (req: Request, res: Response) => {
    const { email, password }: LoginDto = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Role is per-organization now (see OrganizationMembership), so it can't be
      // baked into a token that outlives any single organization context —
      // authMiddleware resolves req.user.role fresh on every request instead.
      const token = jwt.sign({ id: user.id, v: user.tokenVersion }, JWT_SECRET, {
        expiresIn: "3h",
      });

      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: THREE_HOURS_MS, // 3 hours
      });

      return res.status(200).json({
        message: "Login successful",
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
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // Self-service signup, step 1: validates the details and emails a 6-digit
  // OTP, but does NOT create the account yet — that only happens once
  // registerVerify confirms the code. Nothing is persisted as a real User
  // until then, so an abandoned signup never leaves a live account behind.
  static registerStart = async (req: Request, res: Response) => {
    const { fullName, email, password }: RegisterStartDto = req.body;

    if (!fullName?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        message: "Full name, email, and password are required",
      });
    }
    const passwordError = getPasswordStrengthError(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    try {
      const normalizedEmail = email.trim();

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "An account with this email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const otpCode = generateOtp();
      const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

      await prisma.pendingSignup.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          fullName: fullName.trim(),
          password: hashedPassword,
          otpCode,
          otpExpiresAt,
          attempts: 0,
        },
        update: {
          fullName: fullName.trim(),
          password: hashedPassword,
          otpCode,
          otpExpiresAt,
          attempts: 0,
        },
      });

      const sent = await sendEmail(
        [normalizedEmail],
        "Your EMS verification code",
        `Your verification code is ${otpCode}. It expires in 10 minutes.`,
        undefined,
        "otp-verification",
      );
      if (!sent) {
        return res.status(502).json({
          message: "Failed to send the verification email. Please try again.",
        });
      }

      return res.status(200).json({ message: "Verification code sent" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // Self-service signup, step 2: confirms the OTP and only then creates the
  // account, as super_admin of a brand-new organization it owns (there's no
  // existing organization to join yet — invites for adding other members are a
  // separate, later feature). Logs the new user in immediately on success.
  static registerVerify = async (req: Request, res: Response) => {
    const { email, otp }: RegisterVerifyDto = req.body;

    if (!email?.trim() || !otp?.trim()) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required" });
    }

    try {
      const normalizedEmail = email.trim();

      const pending = await prisma.pendingSignup.findUnique({
        where: { email: normalizedEmail },
      });
      if (!pending) {
        return res.status(400).json({
          message: "No pending signup found for this email. Please start again.",
        });
      }
      if (pending.otpExpiresAt.getTime() < Date.now()) {
        await prisma.pendingSignup.delete({ where: { id: pending.id } });
        return res
          .status(400)
          .json({ message: "Verification code expired. Please start again." });
      }
      if (pending.attempts >= MAX_OTP_ATTEMPTS) {
        await prisma.pendingSignup.delete({ where: { id: pending.id } });
        return res.status(400).json({
          message: "Too many incorrect attempts. Please start again.",
        });
      }
      if (pending.otpCode !== otp.trim()) {
        await prisma.pendingSignup.update({
          where: { id: pending.id },
          data: { attempts: pending.attempts + 1 },
        });
        return res.status(400).json({ message: "Incorrect verification code" });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: pending.email },
      });
      if (existingUser) {
        await prisma.pendingSignup.delete({ where: { id: pending.id } });
        return res
          .status(400)
          .json({ message: "An account with this email already exists" });
      }

      const user = await prisma.user.create({
        data: {
          fullName: pending.fullName,
          email: pending.email,
          password: pending.password,
          phoneNumber: "",
          address: "",
          jobPosition: "Owner",
          joinDate: new Date(),
        },
      });

      const organization = await prisma.organization.create({
        data: { name: `${pending.fullName}'s Organization` },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: UserRole.SUPER_ADMIN,
        },
      });

      await prisma.pendingSignup.delete({ where: { id: pending.id } });

      // Role is per-organization now — see the matching comment in login().
      const token = jwt.sign({ id: user.id, v: user.tokenVersion }, JWT_SECRET, {
        expiresIn: "3h",
      });
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
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

  // Forgot-password, step 1: emails a 6-digit OTP if the address has an
  // account. Always returns the same generic message regardless of whether
  // the email exists, so this can't be used to enumerate accounts.
  static forgotPasswordStart = async (req: Request, res: Response) => {
    const { email }: ForgotPasswordStartDto = req.body;

    if (!email?.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    const genericResponse = {
      message: "If an account exists for this email, a verification code has been sent.",
    };

    try {
      const normalizedEmail = email.trim();

      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        // Don't reveal whether the account exists — just respond as if it worked.
        return res.status(200).json(genericResponse);
      }

      const otpCode = generateOtp();
      const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

      await prisma.passwordResetOtp.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          otpCode,
          otpExpiresAt,
          attempts: 0,
        },
        update: {
          otpCode,
          otpExpiresAt,
          attempts: 0,
        },
      });

      const sent = await sendEmail(
        [normalizedEmail],
        "Your EMS password reset code",
        `Your password reset code is ${otpCode}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
        undefined,
        "password-reset",
      );
      if (!sent) {
        return res.status(502).json({
          message: "Failed to send the verification email. Please try again.",
        });
      }

      return res.status(200).json(genericResponse);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // Forgot-password, step 2: confirms the OTP and sets the new password in
  // one call, then logs the user in immediately (same cookie pattern as
  // login/registerVerify) so they land straight in the app.
  static forgotPasswordReset = async (req: Request, res: Response) => {
    const { email, otp, newPassword }: ForgotPasswordResetDto = req.body;

    if (!email?.trim() || !otp?.trim()) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required" });
    }
    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }
    const passwordError = getPasswordStrengthError(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    try {
      const normalizedEmail = email.trim();

      const otpRecord = await prisma.passwordResetOtp.findUnique({
        where: { email: normalizedEmail },
      });
      if (!otpRecord) {
        return res.status(400).json({
          message: "No password reset requested for this email. Please start again.",
        });
      }
      if (otpRecord.otpExpiresAt.getTime() < Date.now()) {
        await prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
        return res
          .status(400)
          .json({ message: "Verification code expired. Please start again." });
      }
      if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        await prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
        return res.status(400).json({
          message: "Too many incorrect attempts. Please start again.",
        });
      }
      if (otpRecord.otpCode !== otp.trim()) {
        await prisma.passwordResetOtp.update({
          where: { id: otpRecord.id },
          data: { attempts: otpRecord.attempts + 1 },
        });
        return res.status(400).json({ message: "Incorrect verification code" });
      }

      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        await prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
        return res.status(404).json({ message: "Account no longer exists" });
      }

      // tokenVersion bumps in the same update as the password — any token
      // issued before this reset (e.g. by whoever's session led to the
      // "forgot password" request in the first place) stops passing
      // authMiddleware's version check immediately, not just after its
      // natural 3h expiry.
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(newPassword, 10),
          tokenVersion: { increment: 1 },
        },
      });
      await prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });

      // Role is per-organization now — see the matching comment in login().
      const token = jwt.sign({ id: updatedUser.id, v: updatedUser.tokenVersion }, JWT_SECRET, {
        expiresIn: "3h",
      });
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: THREE_HOURS_MS,
      });

      return res.status(200).json({
        message: "Password reset successfully",
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
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static logout = async (req: Request, res: Response) => {
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });
    return res.status(200).json({ message: "Logged out successfully" });
  };

  static getMe = async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          // Already resolved by authMiddleware for the active organization —
          // role no longer lives on User (see OrganizationMembership).
          role: req.user!.role,
          phoneNumber: user.phoneNumber,
          address: user.address,
          jobPosition: user.jobPosition,
          joinDate: user.joinDate,
          createdAt: user.createdAt,
          homeOrganizationId: user.homeOrganizationId,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static updateMe = async (req: AuthRequest, res: Response) => {
    const { phoneNumber, address }: UpdateMeDto = req.body;

    try {
      const existingUser = await prisma.user.findUnique({ where: { id: req.user!.id } });

      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          ...(phoneNumber !== undefined ? { phoneNumber } : {}),
          ...(address !== undefined ? { address } : {}),
        },
      });

      return res.status(200).json({
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: req.user!.role,
          phoneNumber: user.phoneNumber,
          address: user.address,
          jobPosition: user.jobPosition,
          joinDate: user.joinDate,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static changePassword = async (req: any, res: Response) => {
    const { currentPassword, newPassword }: ChangePasswordDto = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new password are required" });
    }
    const changePasswordError = getPasswordStrengthError(newPassword);
    if (changePasswordError) {
      return res.status(400).json({ message: changePasswordError });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Bumping tokenVersion here invalidates every other token issued for
      // this account (see authMiddleware's version check) — the whole point
      // of changing your password after suspecting a leak. That would also
      // invalidate the very cookie this request is authenticated with, so a
      // fresh token/cookie carrying the new version is reissued below to
      // keep the current session alive; every other session/leaked token is
      // the one that actually gets logged out.
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(newPassword, 10),
          tokenVersion: { increment: 1 },
        },
      });

      const token = jwt.sign({ id: updatedUser.id, v: updatedUser.tokenVersion }, JWT_SECRET, {
        expiresIn: "3h",
      });
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: THREE_HOURS_MS,
      });

      return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
