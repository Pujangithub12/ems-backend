"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const data_source_1 = require("../config/data-source");
const User_1 = require("../entities/User");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";
class AuthController {
    static login = async (req, res) => {
        const { email, password, role } = req.body;
        if (!email || !password) {
            return res
                .status(400)
                .json({ message: "Email and password are required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const user = await userRepository.findOne({ where: { email } });
            if (!user) {
                return res.status(401).json({ message: "Invalid email or password" });
            }
            const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: "Invalid email or password" });
            }
            // FIX 1: Validate that the user is logging in through the correct portal.
            // If the frontend sends role: "admin" but the user's DB role is "user",
            // reject the login instead of silently issuing a token for the wrong role.
            if (role && role !== user.role) {
                // Allow super_admin to log in via admin portal too
                if (!(role === User_1.UserRole.ADMIN && user.role === User_1.UserRole.SUPER_ADMIN)) {
                    return res.status(403).json({
                        message: role === User_1.UserRole.ADMIN || role === User_1.UserRole.SUPER_ADMIN
                            ? "Access denied. This account does not have admin privileges."
                            : "Please use the admin portal to sign in.",
                    });
                }
            }
            const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, JWT_SECRET, {
                expiresIn: "30d",
            });
            const isProduction = process.env.NODE_ENV === "production";
            res.cookie("token", token, {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            });
            return res.status(200).json({
                message: "Login successful",
                user: {
                    id: user.id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
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
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const user = await userRepository.findOne({ where: { id: req.user.id } });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            return res.status(200).json({
                user: {
                    id: user.id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                },
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.AuthController = AuthController;
//# sourceMappingURL=AuthController.js.map