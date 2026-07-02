import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User, UserRole } from "../entities/User";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET || "your_jwt_secret_key";
const THREE_HOURS_MS = 3 * 60 * 60 * 1000; 

export class AuthController {
  static login = async (req: Request, res: Response) => {
    const { email, password, role } = req.body;

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

      // FIX 1: Validate that the user is logging in through the correct portal.
      // If the frontend sends role: "admin" but the user's DB role is "user",
      // reject the login instead of silently issuing a token for the wrong role.
      if (role && role !== user.role) {
        // Allow super_admin to log in via admin portal too
        if (!(role === UserRole.ADMIN && user.role === UserRole.SUPER_ADMIN)) {
          return res.status(403).json({
            message:
              role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN
                ? "Access denied. This account does not have admin privileges."
                : "Please use the admin portal to sign in.",
          });
        }
      }

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
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
          role: user.role,
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

  static getMe = async (req: any, res: Response) => {
    try {
      const userRepository = AppDataSource.getRepository(User);
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
