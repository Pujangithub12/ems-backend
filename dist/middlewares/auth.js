"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anyPermissionMiddleware = exports.permissionMiddleware = exports.roleMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const permissionService_1 = require("../utils/permissionService");
const jwt_1 = require("../config/jwt");
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
        const decoded = jsonwebtoken_1.default.verify(token, jwt_1.JWT_SECRET);
        req.user = {
            id: decoded.id,
            role: "",
        };
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            include: { memberships: { include: { organization: true } } },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Tokens signed before tokenVersion existed carry no `v` claim — treat
        // that as version 0 (the column's own default) rather than rejecting
        // every pre-existing session the moment this ships. A token is only
        // ever actually rejected here once its holder's password has since
        // changed (see AuthController.changePassword/forgotPasswordReset,
        // which bump user.tokenVersion) — that's what lets a leaked/stolen
        // token be revoked before its 3h expiry instead of staying valid.
        if ((decoded.v ?? 0) !== user.tokenVersion) {
            res.clearCookie("token");
            res.clearCookie("workspaceId");
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }
        const userOrganizations = user.memberships.map((m) => m.organization);
        let memberships = user.memberships;
        const headerOrganizationId = req.headers["x-workspace-id"];
        const rawHeader = Array.isArray(headerOrganizationId)
            ? headerOrganizationId[0]
            : headerOrganizationId;
        let resolvedOrganization = null;
        if (user.homeOrganizationId != null) {
            const home = userOrganizations.find((w) => w.id === user.homeOrganizationId);
            if (!home) {
                return res
                    .status(403)
                    .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
            }
            const requestedId = rawHeader != null
                ? Number(rawHeader)
                : req.cookies.workspaceId
                    ? Number(req.cookies.workspaceId)
                    : null;
            if (requestedId != null &&
                Number.isInteger(requestedId) &&
                requestedId !== home.id) {
                return res
                    .status(403)
                    .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
            }
            resolvedOrganization = home;
        }
        else if (headerOrganizationId) {
            // The frontend is URL-driven: each request declares which organization
            // it's operating on via this header (derived from the route, not
            // shared cookie state), so switching organizations takes effect on the
            // very next request instead of racing a cookie update. Falls back to
            // the cookie below for requests that can't set custom headers (e.g.
            // the static /uploads route).
            const parsedId = Number(rawHeader);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ message: "Invalid organization id" });
            }
            const targetOrganization = userOrganizations.find((w) => w.id === parsedId);
            if (!targetOrganization) {
                return res
                    .status(403)
                    .json({ message: "Not a member of this organization" });
            }
            resolvedOrganization = targetOrganization;
        }
        else {
            // Now get the current organization
            const workspaceId = req.cookies.workspaceId;
            if (!workspaceId) {
                if (userOrganizations.length === 0) {
                    // Brand new account with no organization at all — create a
                    // default one and make them its super admin (mirrors
                    // OrganizationController.create / AuthController.registerVerify).
                    const defaultOrganization = await prisma_1.prisma.organization.create({
                        data: { name: "EMS Workspace" },
                    });
                    const membership = await prisma_1.prisma.organizationMembership.create({
                        data: {
                            userId: user.id,
                            organizationId: defaultOrganization.id,
                            role: enums_1.UserRole.SUPER_ADMIN,
                        },
                    });
                    memberships = [...memberships, { ...membership, organization: defaultOrganization }];
                    resolvedOrganization = defaultOrganization;
                }
                else {
                    resolvedOrganization = userOrganizations[0];
                }
            }
            else {
                // Get organization from cookie — re-verified against this user's
                // actual memberships on every request. The cookie is
                // client-controlled, so trusting its id alone would let anyone
                // read/write another organization's data just by setting
                // workspaceId to its id.
                const cookieOrganization = userOrganizations.find((w) => w.id === Number(workspaceId));
                if (!cookieOrganization) {
                    // Cookie is stale, invalid, or points to an organization this user
                    // is no longer (or never was) a member of — fall back to their first.
                    if (userOrganizations.length > 0) {
                        resolvedOrganization = userOrganizations[0];
                    }
                    else {
                        return res.status(404).json({ message: "Organization not found" });
                    }
                }
                else {
                    resolvedOrganization = cookieOrganization;
                }
            }
        }
        if (!resolvedOrganization) {
            return res.status(404).json({ message: "Organization not found" });
        }
        const membership = memberships.find((m) => m.organization.id === resolvedOrganization.id);
        if (!membership) {
            // Shouldn't happen — resolvedOrganization is always derived from
            // userOrganizations/user.memberships above — but never let a request
            // through with an unresolved role.
            return res
                .status(403)
                .json({ message: "Access Forbidden", code: "WORKSPACE_ACCESS_FORBIDDEN" });
        }
        req.user.role = membership.role;
        req.organization = resolvedOrganization;
        // Keep the durable "last active organization" in sync so a future login
        // (see AuthController.login) can restore it even after this cookie has
        // expired — only written when it actually changes, so a normal request
        // within an already-resolved organization costs no extra write.
        if (user.lastOrganizationId !== resolvedOrganization.id) {
            prisma_1.prisma.user
                .update({
                where: { id: user.id },
                data: { lastOrganizationId: resolvedOrganization.id },
            })
                .catch((err) => console.error("Failed to persist last active organization:", err));
        }
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("workspaceId", resolvedOrganization.id.toString(), {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: THREE_HOURS_MS,
        });
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
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden: Access denied" });
        }
        next();
    };
};
exports.roleMiddleware = roleMiddleware;
/**
 * Gates a route by a dynamic, DB-backed permission instead of a hardcoded
 * role list — see config/permissions.ts and utils/permissionService.ts.
 * A super admin can grant/revoke these per role from the Roles & Permissions
 * settings tab; this middleware is what actually enforces the change.
 */
const permissionMiddleware = (key) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const allowed = await (0, permissionService_1.roleHasPermission)(req.user.role, key);
        if (!allowed) {
            return res.status(403).json({ message: "Forbidden: Access denied" });
        }
        next();
    };
};
exports.permissionMiddleware = permissionMiddleware;
/**
 * Same as permissionMiddleware, but passes if the role holds ANY of the given
 * keys — for routes shared across features gated by different permissions
 * (e.g. the item catalog, writable from both the Inventory and Procurement
 * "Add item" forms, each gated by its own permission key).
 */
const anyPermissionMiddleware = (keys) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        for (const key of keys) {
            if (await (0, permissionService_1.roleHasPermission)(req.user.role, key)) {
                return next();
            }
        }
        return res.status(403).json({ message: "Forbidden: Access denied" });
    };
};
exports.anyPermissionMiddleware = anyPermissionMiddleware;
//# sourceMappingURL=auth.js.map