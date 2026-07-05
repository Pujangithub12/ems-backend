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
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
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
        const workspaceRepo = data_source_1.AppDataSource.getRepository(Workspace_1.Workspace);
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        // The frontend is URL-driven: each request declares which workspace it's
        // operating on via this header (derived from the route, not shared cookie
        // state), so switching workspaces takes effect on the very next request
        // instead of racing a cookie update. Falls back to the cookie below for
        // requests that can't set custom headers (e.g. the static /uploads route).
        const headerWorkspaceId = req.headers["x-workspace-id"];
        if (headerWorkspaceId) {
            const raw = Array.isArray(headerWorkspaceId)
                ? headerWorkspaceId[0]
                : headerWorkspaceId;
            const parsedId = Number(raw);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ message: "Invalid workspace id" });
            }
            const user = await userRepo.findOne({
                where: { id: req.user.id },
                relations: ["workspaces"],
            });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            const targetWorkspace = user.workspaces.find((w) => w.id === parsedId);
            if (!targetWorkspace) {
                return res
                    .status(403)
                    .json({ message: "Not a member of this workspace" });
            }
            req.workspace = targetWorkspace;
            // Keep the cookie in sync as the "last used" default for requests
            // without the header.
            const isProduction = process.env.NODE_ENV === "production";
            res.cookie("workspaceId", targetWorkspace.id.toString(), {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
                maxAge: THREE_HOURS_MS,
            });
            return next();
        }
        // Now get the current workspace
        let workspaceId = req.cookies.workspaceId;
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
                    maxAge: THREE_HOURS_MS, // 3 hours
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
                    maxAge: THREE_HOURS_MS, // 3 hours
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
                        maxAge: THREE_HOURS_MS, // 3 hours
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
        res.clearCookie("token");
        res.clearCookie("workspaceId");
        return res.status(401).json({ message: "Invalid or expired token" });
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
//# sourceMappingURL=auth.js.map