"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = exports.countSuperAdminsInOrganization = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const bcrypt_1 = __importDefault(require("bcrypt"));
// At most one super admin per organization. `excludeUserId` lets an update check
// exclude the user being updated (a no-op re-save of an existing super admin
// shouldn't trip over itself). Exported for InviteController, which enforces
// the same rule when sending/accepting an invite.
const countSuperAdminsInOrganization = async (organizationId, excludeUserId) => {
    return prisma_1.prisma.organizationMembership.count({
        where: {
            organizationId,
            role: enums_1.UserRole.SUPER_ADMIN,
            ...(excludeUserId !== undefined ? { userId: { not: excludeUserId } } : {}),
        },
    });
};
exports.countSuperAdminsInOrganization = countSuperAdminsInOrganization;
class UserController {
    static getAllUsers = async (req, res) => {
        try {
            const organization = req.organization;
            // Get all members of the current organization, with their role in it.
            const memberships = await prisma_1.prisma.organizationMembership.findMany({
                where: { organizationId: organization.id },
                include: { user: true },
            });
            const users = memberships.map((m) => ({
                id: m.user.id,
                fullName: m.user.fullName,
                email: m.user.email,
                phoneNumber: m.user.phoneNumber,
                address: m.user.address,
                jobPosition: m.user.jobPosition,
                joinDate: m.user.joinDate,
                role: m.role,
                createdAt: m.user.createdAt,
            }));
            return res.status(200).json(users);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static deleteUser = async (req, res) => {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "User ID is required" });
        }
        try {
            const organization = req.organization;
            // Find the membership only if they are in the current organization
            const membership = await prisma_1.prisma.organizationMembership.findFirst({
                where: {
                    userId: parseInt(id),
                    organizationId: organization.id,
                },
            });
            if (!membership) {
                return res.status(404).json({ message: "User not found" });
            }
            // Admins can remove regular users/finance, but not peers or super admins
            // — only a super admin can remove another admin (or a user).
            const currentUserRole = req.user?.role;
            if (currentUserRole === enums_1.UserRole.ADMIN &&
                (membership.role === enums_1.UserRole.ADMIN || membership.role === enums_1.UserRole.SUPER_ADMIN)) {
                return res.status(403).json({
                    message: "Admins cannot remove other admins or super admins",
                });
            }
            // Remove user from organization (their membership in any other organization
            // is untouched).
            await prisma_1.prisma.organizationMembership.delete({ where: { id: membership.id } });
            return res
                .status(200)
                .json({ message: "User removed from organization successfully" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateUser = async (req, res) => {
        const { id } = req.params;
        const { fullName, email, password, phoneNumber, address, jobPosition, joinDate, role, } = req.body;
        if (!id) {
            return res.status(400).json({ message: "User ID is required" });
        }
        try {
            const organization = req.organization;
            // Find the membership (and its user) only if they are in the current
            // organization — role updates below apply to this membership, i.e. this
            // organization only.
            const membership = await prisma_1.prisma.organizationMembership.findFirst({
                where: {
                    userId: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!membership) {
                return res.status(404).json({ message: "User not found" });
            }
            const user = membership.user;
            const userData = {};
            if (fullName)
                userData.fullName = fullName;
            if (email)
                userData.email = email;
            if (phoneNumber)
                userData.phoneNumber = phoneNumber;
            if (address)
                userData.address = address;
            if (jobPosition)
                userData.jobPosition = jobPosition;
            if (joinDate)
                userData.joinDate = new Date(joinDate);
            // Enforce role update rules
            let newRole;
            const currentUserRole = req.user?.role;
            if (role) {
                if (currentUserRole === enums_1.UserRole.ADMIN) {
                    // Admin can set role to user, finance, or admin, but not super admin
                    if (role === enums_1.UserRole.USER ||
                        role === enums_1.UserRole.FINANCE ||
                        role === enums_1.UserRole.ADMIN) {
                        newRole = role;
                    }
                }
                else if (currentUserRole === enums_1.UserRole.SUPER_ADMIN) {
                    // Super admin can set any role, but only one super admin is
                    // allowed per organization.
                    if (role === enums_1.UserRole.SUPER_ADMIN && membership.role !== enums_1.UserRole.SUPER_ADMIN) {
                        const existingSuperAdmins = await (0, exports.countSuperAdminsInOrganization)(organization.id, user.id);
                        if (existingSuperAdmins > 0) {
                            return res
                                .status(400)
                                .json({ message: "This organization already has a super admin" });
                        }
                    }
                    newRole = role;
                }
                // Regular users can't change roles
            }
            if (password) {
                userData.password = await bcrypt_1.default.hash(password, 10);
            }
            await prisma_1.prisma.user.update({ where: { id: user.id }, data: userData });
            await prisma_1.prisma.organizationMembership.update({
                where: { id: membership.id },
                data: newRole !== undefined ? { role: newRole } : {},
            });
            return res.status(200).json({ message: "User updated successfully" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.UserController = UserController;
//# sourceMappingURL=UserController.js.map