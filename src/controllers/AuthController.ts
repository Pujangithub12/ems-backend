import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import { Workspace } from "../entities/Workspace";
import { WorkspaceMembership } from "../entities/WorkspaceMembership";
import { PendingSignup } from "../entities/PendingSignup";
import { PasswordResetOtp } from "../entities/PasswordResetOtp";
import { AuthRequest } from "../middlewares/auth";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
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

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET || "your_jwt_secret_key";
const THREE_HOURS_MS = 3 * 60 * 60 * 1000; 

export class AuthController {
  static login = async (req: Request, res: Response) => {
    const { email, password }: LoginDto = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Role is per-workspace now (see WorkspaceMembership), so it can't be
      // baked into a token that outlives any single workspace context —
      // authMiddleware resolves req.user.role fresh on every request instead.
      const token = jwt.sign({ id: user.id }, JWT_SECRET, {
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
          homeWorkspaceId: user.homeWorkspaceId,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
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
      const userRepository = AppDataSource.getRepository(User);
      const pendingRepository = AppDataSource.getRepository(PendingSignup);
      const normalizedEmail = email.trim();

      const existingUser = await userRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "An account with this email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      let pending = await pendingRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (!pending) {
        pending = pendingRepository.create({ email: normalizedEmail });
      }
      pending.fullName = fullName.trim();
      pending.password = hashedPassword;
      pending.otpCode = otpCode;
      pending.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
      pending.attempts = 0;
      await pendingRepository.save(pending);

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
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  // Self-service signup, step 2: confirms the OTP and only then creates the
  // account, as super_admin of a brand-new workspace it owns (there's no
  // existing workspace to join yet — invites for adding other members are a
  // separate, later feature). Logs the new user in immediately on success.
  static registerVerify = async (req: Request, res: Response) => {
    const { email, otp }: RegisterVerifyDto = req.body;

    if (!email?.trim() || !otp?.trim()) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required" });
    }

    try {
      const pendingRepository = AppDataSource.getRepository(PendingSignup);
      const userRepository = AppDataSource.getRepository(User);
      const workspaceRepository = AppDataSource.getRepository(Workspace);
      const normalizedEmail = email.trim();

      const pending = await pendingRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (!pending) {
        return res.status(400).json({
          message: "No pending signup found for this email. Please start again.",
        });
      }
      if (pending.otpExpiresAt.getTime() < Date.now()) {
        await pendingRepository.remove(pending);
        return res
          .status(400)
          .json({ message: "Verification code expired. Please start again." });
      }
      if (pending.attempts >= MAX_OTP_ATTEMPTS) {
        await pendingRepository.remove(pending);
        return res.status(400).json({
          message: "Too many incorrect attempts. Please start again.",
        });
      }
      if (pending.otpCode !== otp.trim()) {
        pending.attempts += 1;
        await pendingRepository.save(pending);
        return res.status(400).json({ message: "Incorrect verification code" });
      }

      const existingUser = await userRepository.findOne({
        where: { email: pending.email },
      });
      if (existingUser) {
        await pendingRepository.remove(pending);
        return res
          .status(400)
          .json({ message: "An account with this email already exists" });
      }

      const user = userRepository.create({
        fullName: pending.fullName,
        email: pending.email,
        password: pending.password,
        phoneNumber: "",
        address: "",
        jobPosition: "Owner",
        joinDate: new Date(),
      });
      await userRepository.save(user);

      const workspace = workspaceRepository.create({
        name: `${pending.fullName}'s Workspace`,
      });
      await workspaceRepository.save(workspace);

      const membershipRepository = AppDataSource.getRepository(WorkspaceMembership);
      await membershipRepository.save(
        membershipRepository.create({
          user,
          workspace,
          role: UserRole.SUPER_ADMIN,
        }),
      );

      await pendingRepository.remove(pending);

      // Role is per-workspace now — see the matching comment in login().
      const token = jwt.sign({ id: user.id }, JWT_SECRET, {
        expiresIn: "3h",
      });
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
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
      const userRepository = AppDataSource.getRepository(User);
      const otpRepository = AppDataSource.getRepository(PasswordResetOtp);
      const normalizedEmail = email.trim();

      const user = await userRepository.findOne({ where: { email: normalizedEmail } });
      if (!user) {
        // Don't reveal whether the account exists — just respond as if it worked.
        return res.status(200).json(genericResponse);
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      let otpRecord = await otpRepository.findOne({ where: { email: normalizedEmail } });
      if (!otpRecord) {
        otpRecord = otpRepository.create({ email: normalizedEmail });
      }
      otpRecord.otpCode = otpCode;
      otpRecord.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
      otpRecord.attempts = 0;
      await otpRepository.save(otpRecord);

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
      return res.status(500).json({ message: "Internal server error", error });
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
      const otpRepository = AppDataSource.getRepository(PasswordResetOtp);
      const userRepository = AppDataSource.getRepository(User);
      const normalizedEmail = email.trim();

      const otpRecord = await otpRepository.findOne({ where: { email: normalizedEmail } });
      if (!otpRecord) {
        return res.status(400).json({
          message: "No password reset requested for this email. Please start again.",
        });
      }
      if (otpRecord.otpExpiresAt.getTime() < Date.now()) {
        await otpRepository.remove(otpRecord);
        return res
          .status(400)
          .json({ message: "Verification code expired. Please start again." });
      }
      if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        await otpRepository.remove(otpRecord);
        return res.status(400).json({
          message: "Too many incorrect attempts. Please start again.",
        });
      }
      if (otpRecord.otpCode !== otp.trim()) {
        otpRecord.attempts += 1;
        await otpRepository.save(otpRecord);
        return res.status(400).json({ message: "Incorrect verification code" });
      }

      const user = await userRepository.findOne({ where: { email: normalizedEmail } });
      if (!user) {
        await otpRepository.remove(otpRecord);
        return res.status(404).json({ message: "Account no longer exists" });
      }

      user.password = await bcrypt.hash(newPassword, 10);
      await userRepository.save(user);
      await otpRepository.remove(otpRecord);

      // Role is per-workspace now — see the matching comment in login().
      const token = jwt.sign({ id: user.id }, JWT_SECRET, {
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
          homeWorkspaceId: user.homeWorkspaceId,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
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
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user!.id } });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          // Already resolved by authMiddleware for the active workspace —
          // role no longer lives on User (see WorkspaceMembership).
          role: req.user!.role,
          phoneNumber: user.phoneNumber,
          address: user.address,
          jobPosition: user.jobPosition,
          joinDate: user.joinDate,
          createdAt: user.createdAt,
          homeWorkspaceId: user.homeWorkspaceId,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateMe = async (req: AuthRequest, res: Response) => {
    const { phoneNumber, address }: UpdateMeDto = req.body;

    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user!.id } });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
      if (address !== undefined) user.address = address;
      await userRepository.save(user);

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
      return res.status(500).json({ message: "Internal server error", error });
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
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user.id } });

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

      user.password = await bcrypt.hash(newPassword, 10);
      await userRepository.save(user);

      return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
