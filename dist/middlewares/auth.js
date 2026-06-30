"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const data_source_1 = require("../config/data-source");
const Workspace_1 = require("../entities/Workspace");
const User_1 = require("../entities/User");
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token = req.cookies?.token;
    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = {
            id: decoded.id,
            role: decoded.role,
        };
        // Now get the current workspace
        let workspaceId = req.cookies.workspaceId;
        const workspaceRepo = data_source_1.AppDataSource.getRepository(Workspace_1.Workspace);
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        if (!workspaceId) {
            // Try to get user's first workspace or create default
            const user = await userRepo.findOne({
                where: { id: req.user.id },
                relations: ["workspaces"],
            });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            if (user.workspaces.length === 0) {
                // Create default workspace
                const defaultWorkspace = workspaceRepo.create({
                    name: "EMS Workspace",
                    members: [user],
                });
                await workspaceRepo.save(defaultWorkspace);
                workspaceId = defaultWorkspace.id.toString();
                // Set cookie
                const isProduction = process.env.NODE_ENV === "production";
                res.cookie("workspaceId", workspaceId, {
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: isProduction ? "none" : "lax",
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                });
                req.workspace = defaultWorkspace;
            }
            else {
                const firstWorkspace = user.workspaces[0];
                if (!firstWorkspace) {
                    return res.status(404).json({ message: "Workspace not found" });
                }
                workspaceId = firstWorkspace.id.toString();
                // Set cookie
                const isProduction = process.env.NODE_ENV === "production";
                res.cookie("workspaceId", workspaceId, {
                    httpOnly: true,
                    secure: isProduction,
                    sameSite: isProduction ? "none" : "lax",
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                });
                req.workspace = firstWorkspace;
            }
        }
        else {
            // Get workspace from cookie
            const workspace = await workspaceRepo.findOne({
                where: { id: Number(workspaceId) },
            });
            if (!workspace) {
                // Invalid workspace cookie, fallback to first
                const user = await userRepo.findOne({
                    where: { id: req.user.id },
                    relations: ["workspaces"],
                });
                if (user && user.workspaces.length > 0) {
                    const fallbackWorkspace = user.workspaces[0];
                    if (!fallbackWorkspace) {
                        return res.status(404).json({ message: "Workspace not found" });
                    }
                    req.workspace = fallbackWorkspace;
                    const isProduction = process.env.NODE_ENV === "production";
                    res.cookie("workspaceId", fallbackWorkspace.id.toString(), {
                        httpOnly: true,
                        secure: isProduction,
                        sameSite: isProduction ? "none" : "lax",
                        maxAge: 30 * 24 * 60 * 60 * 1000,
                    });
                }
                else {
                    return res.status(404).json({ message: "Workspace not found" });
                }
            }
            else {
                req.workspace = workspace;
            }
        }
        next();
    }
    catch (error) {
        console.error("Auth middleware error:", error);
        return res.status(401).json({ message: "Invalid token" });
    }
};
exports.authMiddleware = authMiddleware;
const roleMiddleware = (roles) => {
    return (req, res, next) => {
        console.log("roleMiddleware:", req.user?.role, roles);
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden: Access denied" });
        }
        next();
    };
};
exports.roleMiddleware = roleMiddleware;
// import { Request, Response, NextFunction } from "express";
// import jwt from "jsonwebtoken";
// import dotenv from "dotenv";
// import { AppDataSource } from "../config/data-source";
// import { Workspace } from "../entities/Workspace";
// import { User } from "../entities/User";
// dotenv.config();
// const JWT_SECRET: string = process.env.JWT_SECRET || "your_jwt_secret_key";
// export interface AuthRequest extends Request {
//   user?: {
//     id: number;
//     role: string;
//   };
//   workspace?: Workspace;
// }
// export const authMiddleware = async (
//   req: AuthRequest,
//   res: Response,
//   next: NextFunction,
// ) => {
//   const authHeader = req.headers.authorization;
//   let token = req.cookies?.token;
//   if (!token && authHeader && authHeader.startsWith("Bearer ")) {
//     token = authHeader.split(" ")[1];
//   }
//   if (!token) {
//     return res.status(401).json({ message: "No token provided" });
//   }
//   try {
//     const decoded = jwt.verify(token, JWT_SECRET) as any;
//     req.user = {
//       id: decoded.id,
//       role: decoded.role,
//     };
//     // Now get the current workspace
//     let workspaceId = req.cookies.workspaceId;
//     const workspaceRepo = AppDataSource.getRepository(Workspace);
//     const userRepo = AppDataSource.getRepository(User);
//     if (!workspaceId) {
//       // Try to get user's first workspace or create default
//       const user = await userRepo.findOne({
//         where: { id: req.user.id },
//         relations: ["workspaces"],
//       });
//       if (!user) {
//         return res.status(404).json({ message: "User not found" });
//       }
//       if (user.workspaces.length === 0) {
//         // Create default workspace
//         const defaultWorkspace = workspaceRepo.create({
//           name: "EMS Workspace",
//           members: [user],
//         });
//         await workspaceRepo.save(defaultWorkspace);
//         workspaceId = defaultWorkspace.id.toString();
//         // Set cookie
//         const isProduction = process.env.NODE_ENV === "production";
//         res.cookie("workspaceId", workspaceId, {
//           httpOnly: true,
//           secure: isProduction,
//           sameSite: isProduction ? "none" : "lax",
//           maxAge: 30 * 24 * 60 * 60 * 1000,
//         });
//         req.workspace = defaultWorkspace;
//       } else {
//         const firstWorkspace = user.workspaces[0];
//         workspaceId = firstWorkspace.id.toString();
//         // Set cookie
//         const isProduction = process.env.NODE_ENV === "production";
//         res.cookie("workspaceId", workspaceId, {
//           httpOnly: true,
//           secure: isProduction,
//           sameSite: isProduction ? "none" : "lax",
//           maxAge: 30 * 24 * 60 * 60 * 1000,
//         });
//         req.workspace = firstWorkspace;
//       }
//     } else {
//       // Get workspace from cookie
//       const workspace = await workspaceRepo.findOne({
//         where: { id: Number(workspaceId) },
//       });
//       if (!workspace) {
//         // Invalid workspace cookie, fallback to first
//         const user = await userRepo.findOne({
//           where: { id: req.user.id },
//           relations: ["workspaces"],
//         });
//         if (user && user.workspaces.length > 0) {
//           req.workspace = user.workspaces[0];
//           const isProduction = process.env.NODE_ENV === "production";
//           res.cookie("workspaceId", user.workspaces[0].id.toString(), {
//             httpOnly: true,
//             secure: isProduction,
//             sameSite: isProduction ? "none" : "lax",
//             maxAge: 30 * 24 * 60 * 60 * 1000,
//           });
//         } else {
//           return res.status(404).json({ message: "Workspace not found" });
//         }
//       } else {
//         req.workspace = workspace;
//       }
//     }
//     next();
//   } catch (error) {
//     console.error("Auth middleware error:", error);
//     return res.status(401).json({ message: "Invalid token" });
//   }
// };
// export const roleMiddleware = (roles: string[]) => {
//   return (req: AuthRequest, res: Response, next: NextFunction) => {
//     console.log("roleMiddleware:", req.user?.role, roles);
//     if (!req.user || !roles.includes(req.user.role)) {
//       return res.status(403).json({ message: "Forbidden: Access denied" });
//     }
//     next();
//   };
// };
//# sourceMappingURL=auth.js.map