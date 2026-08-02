"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionController = void 0;
const prisma_1 = require("../config/prisma");
const permissions_1 = require("../config/permissions");
const permissionService_1 = require("../utils/permissionService");
class PermissionController {
    // Any authenticated user can view the matrix — the Roles & Permissions
    // tab is visible (read-only for non-admins) to everyone.
    static getMatrix = async (_req, res) => {
        try {
            const permissions = await (0, permissionService_1.getPermissionMatrix)();
            return res.status(200).json({ permissions });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    // Route is gated to super_admin only in routes.ts — not by a toggleable
    // permission, so a super admin can never accidentally lock themselves out.
    static updateMatrix = async (req, res) => {
        const { updates } = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({ message: "updates array is required" });
        }
        try {
            for (const update of updates) {
                if (!update ||
                    !(0, permissions_1.isPermissionRole)(update.role) ||
                    !(0, permissions_1.isPermissionKey)(update.permissionKey)) {
                    continue;
                }
                await prisma_1.prisma.rolePermission.upsert({
                    where: {
                        role_permissionKey: { role: update.role, permissionKey: update.permissionKey },
                    },
                    update: { granted: !!update.granted },
                    create: {
                        role: update.role,
                        permissionKey: update.permissionKey,
                        granted: !!update.granted,
                    },
                });
            }
            const permissions = await (0, permissionService_1.getPermissionMatrix)();
            return res.status(200).json({ permissions });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.PermissionController = PermissionController;
//# sourceMappingURL=PermissionController.js.map