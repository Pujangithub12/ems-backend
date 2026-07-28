"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const emailService_1 = require("../utils/emailService");
const passwordPolicy_1 = require("../utils/passwordPolicy");
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
class AuthController {
    static login = async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            return res
                .status(400)
                .json({ message: "Email and password are required" });
        }
        try {
            const user = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (!user) {
                return res.status(401).json({ message: "Invalid email or password" });
            }
            const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: "Invalid email or password" });
            }
            // Role is per-organization now (see OrganizationMembership), so it can't be
            // baked into a token that outlives any single organization context —
            // authMiddleware resolves req.user.role fresh on every request instead.
            const token = jsonwebtoken_1.default.sign({ id: user.id }, JWT_SECRET, {
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    // Self-service signup, step 1: validates the details and emails a 6-digit
    // OTP, but does NOT create the account yet — that only happens once
    // registerVerify confirms the code. Nothing is persisted as a real User
    // until then, so an abandoned signup never leaves a live account behind.
    static registerStart = async (req, res) => {
        const { fullName, email, password } = req.body;
        if (!fullName?.trim() || !email?.trim() || !password) {
            return res.status(400).json({
                message: "Full name, email, and password are required",
            });
        }
        const passwordError = (0, passwordPolicy_1.getPasswordStrengthError)(password);
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
        }
        try {
            const normalizedEmail = email.trim();
            const existingUser = await prisma_1.prisma.user.findUnique({
                where: { email: normalizedEmail },
            });
            if (existingUser) {
                return res
                    .status(400)
                    .json({ message: "An account with this email already exists" });
            }
            const hashedPassword = await bcrypt_1.default.hash(password, 10);
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
            await prisma_1.prisma.pendingSignup.upsert({
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
            const sent = await (0, emailService_1.sendEmail)([normalizedEmail], "Your EMS verification code", `Your verification code is ${otpCode}. It expires in 10 minutes.`, undefined, "otp-verification");
            if (!sent) {
                return res.status(502).json({
                    message: "Failed to send the verification email. Please try again.",
                });
            }
            return res.status(200).json({ message: "Verification code sent" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    // Self-service signup, step 2: confirms the OTP and only then creates the
    // account, as super_admin of a brand-new organization it owns (there's no
    // existing organization to join yet — invites for adding other members are a
    // separate, later feature). Logs the new user in immediately on success.
    static registerVerify = async (req, res) => {
        const { email, otp } = req.body;
        if (!email?.trim() || !otp?.trim()) {
            return res
                .status(400)
                .json({ message: "Email and verification code are required" });
        }
        try {
            const normalizedEmail = email.trim();
            const pending = await prisma_1.prisma.pendingSignup.findUnique({
                where: { email: normalizedEmail },
            });
            if (!pending) {
                return res.status(400).json({
                    message: "No pending signup found for this email. Please start again.",
                });
            }
            if (pending.otpExpiresAt.getTime() < Date.now()) {
                await prisma_1.prisma.pendingSignup.delete({ where: { id: pending.id } });
                return res
                    .status(400)
                    .json({ message: "Verification code expired. Please start again." });
            }
            if (pending.attempts >= MAX_OTP_ATTEMPTS) {
                await prisma_1.prisma.pendingSignup.delete({ where: { id: pending.id } });
                return res.status(400).json({
                    message: "Too many incorrect attempts. Please start again.",
                });
            }
            if (pending.otpCode !== otp.trim()) {
                await prisma_1.prisma.pendingSignup.update({
                    where: { id: pending.id },
                    data: { attempts: pending.attempts + 1 },
                });
                return res.status(400).json({ message: "Incorrect verification code" });
            }
            const existingUser = await prisma_1.prisma.user.findUnique({
                where: { email: pending.email },
            });
            if (existingUser) {
                await prisma_1.prisma.pendingSignup.delete({ where: { id: pending.id } });
                return res
                    .status(400)
                    .json({ message: "An account with this email already exists" });
            }
            const user = await prisma_1.prisma.user.create({
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
            const organization = await prisma_1.prisma.organization.create({
                data: { name: `${pending.fullName}'s Organization` },
            });
            await prisma_1.prisma.organizationMembership.create({
                data: {
                    userId: user.id,
                    organizationId: organization.id,
                    role: enums_1.UserRole.SUPER_ADMIN,
                },
            });
            await prisma_1.prisma.pendingSignup.delete({ where: { id: pending.id } });
            // Role is per-organization now — see the matching comment in login().
            const token = jsonwebtoken_1.default.sign({ id: user.id }, JWT_SECRET, {
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    // Forgot-password, step 1: emails a 6-digit OTP if the address has an
    // account. Always returns the same generic message regardless of whether
    // the email exists, so this can't be used to enumerate accounts.
    static forgotPasswordStart = async (req, res) => {
        const { email } = req.body;
        if (!email?.trim()) {
            return res.status(400).json({ message: "Email is required" });
        }
        const genericResponse = {
            message: "If an account exists for this email, a verification code has been sent.",
        };
        try {
            const normalizedEmail = email.trim();
            const user = await prisma_1.prisma.user.findUnique({ where: { email: normalizedEmail } });
            if (!user) {
                // Don't reveal whether the account exists — just respond as if it worked.
                return res.status(200).json(genericResponse);
            }
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
            await prisma_1.prisma.passwordResetOtp.upsert({
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
            const sent = await (0, emailService_1.sendEmail)([normalizedEmail], "Your EMS password reset code", `Your password reset code is ${otpCode}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`, undefined, "password-reset");
            if (!sent) {
                return res.status(502).json({
                    message: "Failed to send the verification email. Please try again.",
                });
            }
            return res.status(200).json(genericResponse);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    // Forgot-password, step 2: confirms the OTP and sets the new password in
    // one call, then logs the user in immediately (same cookie pattern as
    // login/registerVerify) so they land straight in the app.
    static forgotPasswordReset = async (req, res) => {
        const { email, otp, newPassword } = req.body;
        if (!email?.trim() || !otp?.trim()) {
            return res
                .status(400)
                .json({ message: "Email and verification code are required" });
        }
        if (!newPassword) {
            return res.status(400).json({ message: "New password is required" });
        }
        const passwordError = (0, passwordPolicy_1.getPasswordStrengthError)(newPassword);
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
        }
        try {
            const normalizedEmail = email.trim();
            const otpRecord = await prisma_1.prisma.passwordResetOtp.findUnique({
                where: { email: normalizedEmail },
            });
            if (!otpRecord) {
                return res.status(400).json({
                    message: "No password reset requested for this email. Please start again.",
                });
            }
            if (otpRecord.otpExpiresAt.getTime() < Date.now()) {
                await prisma_1.prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
                return res
                    .status(400)
                    .json({ message: "Verification code expired. Please start again." });
            }
            if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
                await prisma_1.prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
                return res.status(400).json({
                    message: "Too many incorrect attempts. Please start again.",
                });
            }
            if (otpRecord.otpCode !== otp.trim()) {
                await prisma_1.prisma.passwordResetOtp.update({
                    where: { id: otpRecord.id },
                    data: { attempts: otpRecord.attempts + 1 },
                });
                return res.status(400).json({ message: "Incorrect verification code" });
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { email: normalizedEmail } });
            if (!user) {
                await prisma_1.prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
                return res.status(404).json({ message: "Account no longer exists" });
            }
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { password: await bcrypt_1.default.hash(newPassword, 10) },
            });
            await prisma_1.prisma.passwordResetOtp.delete({ where: { id: otpRecord.id } });
            // Role is per-organization now — see the matching comment in login().
            const token = jsonwebtoken_1.default.sign({ id: user.id }, JWT_SECRET, {
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static logout = async (req, res) => {
        const isProduction = process.env.NODE_ENV === "production";
        res.clearCookie("token", {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
        });
        return res.status(200).json({ message: "Logged out successfully" });
    };
    static getMe = async (req, res) => {
        try {
            const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
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
                    role: req.user.role,
                    phoneNumber: user.phoneNumber,
                    address: user.address,
                    jobPosition: user.jobPosition,
                    joinDate: user.joinDate,
                    createdAt: user.createdAt,
                    homeOrganizationId: user.homeOrganizationId,
                },
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateMe = async (req, res) => {
        const { phoneNumber, address } = req.body;
        try {
            const existingUser = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!existingUser) {
                return res.status(404).json({ message: "User not found" });
            }
            const user = await prisma_1.prisma.user.update({
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
                    role: req.user.role,
                    phoneNumber: user.phoneNumber,
                    address: user.address,
                    jobPosition: user.jobPosition,
                    joinDate: user.joinDate,
                    createdAt: user.createdAt,
                },
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static changePassword = async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res
                .status(400)
                .json({ message: "Current and new password are required" });
        }
        const changePasswordError = (0, passwordPolicy_1.getPasswordStrengthError)(newPassword);
        if (changePasswordError) {
            return res.status(400).json({ message: changePasswordError });
        }
        try {
            const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            const isPasswordValid = await bcrypt_1.default.compare(currentPassword, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: "Current password is incorrect" });
            }
            await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { password: await bcrypt_1.default.hash(newPassword, 10) },
            });
            return res.status(200).json({ message: "Password updated successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.AuthController = AuthController;
//# sourceMappingURL=AuthController.js.map