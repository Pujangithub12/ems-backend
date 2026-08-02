"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaveRequestController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const hierarchyAuthority_1 = require("../utils/hierarchyAuthority");
const notificationService_1 = require("../services/notificationService");
// `user` was an eager relation on LeaveRequest under TypeORM, so it was
// always populated (and included the password hash) regardless of the
// `relations` option passed to the query. Prisma has no eager-loading
// concept, so every query below explicitly `include`s `user` — this still
// strips it down to the safe subset before sending requests to the client.
const sanitizeUser = (lr) => {
    if (lr.user) {
        const { id, fullName, email } = lr.user;
        lr.user = { id, fullName, email };
    }
};
class LeaveRequestController {
    static createLeaveRequest = async (req, res) => {
        const { title, startDate, endDate, reason } = req.body;
        if (!title || !startDate || !endDate || !reason) {
            return res
                .status(400)
                .json({ message: "title, startDate, endDate and reason are required" });
        }
        try {
            const userId = req.user?.id;
            const organization = req.organization;
            const user = await prisma_1.prisma.user.findFirst({
                where: { id: userId },
            });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const newRequest = await prisma_1.prisma.leaveRequest.create({
                data: {
                    userId: user.id,
                    title,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    reason,
                    status: "pending",
                    organizationId: organization.id,
                },
            });
            const leaveRequest = { ...newRequest, user };
            sanitizeUser(leaveRequest);
            (0, notificationService_1.getUserIdsByRole)(organization.id, [enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN])
                .then((approverIds) => (0, notificationService_1.notifyUsers)(approverIds.filter((id) => id !== user.id), {
                organizationId: organization.id,
                type: "approval_requested",
                title: "New leave request",
                message: `${user.fullName} submitted a leave request: "${title}"`,
                link: `/${organization.id}/leaverequests`,
            }))
                .catch((err) => console.error("Failed to send leave-request notification:", err));
            return res
                .status(201)
                .json({ message: "Leave request created", leaveRequest });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getAllLeaveRequests = async (req, res) => {
        try {
            const organization = req.organization;
            if (req.user?.role === enums_1.UserRole.ADMIN ||
                req.user?.role === enums_1.UserRole.SUPER_ADMIN) {
                const all = await prisma_1.prisma.leaveRequest.findMany({
                    where: { organizationId: organization.id },
                    orderBy: { createdAt: "desc" },
                    include: { user: true },
                });
                // Add history count for admin
                const requestsWithHistory = await Promise.all(all.map(async (lr) => {
                    const historyCount = await prisma_1.prisma.leaveRequest.count({
                        where: {
                            userId: lr.userId,
                            status: "approved",
                            organizationId: organization.id,
                        },
                    });
                    const shaped = { ...lr };
                    sanitizeUser(shaped);
                    return { ...shaped, historyCount };
                }));
                return res.status(200).json(requestsWithHistory);
            }
            const mine = await prisma_1.prisma.leaveRequest.findMany({
                where: {
                    userId: req.user.id,
                    organizationId: organization.id,
                },
                orderBy: { createdAt: "desc" },
                include: { user: true },
            });
            const mineShaped = mine.map((lr) => {
                const shaped = { ...lr };
                sanitizeUser(shaped);
                return shaped;
            });
            return res.status(200).json(mineShaped);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateStatus = async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }
        try {
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const organization = req.organization;
            const lr = await prisma_1.prisma.leaveRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            const allowed = await (0, hierarchyAuthority_1.canApprove)(organization.id, req.user.id, req.user.role, lr.userId);
            if (!allowed) {
                return res.status(403).json({
                    message: "Only this person's manager can approve this request",
                });
            }
            const updated = await prisma_1.prisma.leaveRequest.update({
                where: { id: lr.id },
                data: { status: status, approvedAt: new Date() },
            });
            const leaveRequest = { ...updated, user: lr.user };
            sanitizeUser(leaveRequest);
            if (lr.userId) {
                (0, notificationService_1.notifyUsers)([lr.userId], {
                    organizationId: organization.id,
                    type: "approval_decided",
                    title: `Leave request ${status}`,
                    message: `Your leave request "${lr.title}" was ${status}`,
                    link: `/${organization.id}/leaverequests`,
                }).catch((err) => console.error("Failed to send leave-decision notification:", err));
            }
            return res
                .status(200)
                .json({ message: `Leave request ${status}`, leaveRequest });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getLeaveRequestById = async (req, res) => {
        const { id } = req.params;
        try {
            const organization = req.organization;
            const lr = await prisma_1.prisma.leaveRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN &&
                lr.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const shaped = { ...lr };
            sanitizeUser(shaped);
            return res.status(200).json(shaped);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateLeaveRequest = async (req, res) => {
        const { id } = req.params;
        const { startDate, endDate, reason } = req.body;
        try {
            const organization = req.organization;
            const lr = await prisma_1.prisma.leaveRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
                include: { user: true },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN &&
                lr.userId !== req.user?.id) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const data = {};
            if (startDate)
                data.startDate = new Date(startDate);
            if (endDate)
                data.endDate = new Date(endDate);
            if (reason)
                data.reason = reason;
            const updated = await prisma_1.prisma.leaveRequest.update({
                where: { id: lr.id },
                data,
            });
            const leaveRequest = { ...updated, user: lr.user };
            sanitizeUser(leaveRequest);
            return res
                .status(200)
                .json({ message: "Leave request updated", leaveRequest });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static deleteLeaveRequest = async (req, res) => {
        const { id } = req.params;
        try {
            if (req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
                return res.status(403).json({ message: "Forbidden" });
            }
            const organization = req.organization;
            const lr = await prisma_1.prisma.leaveRequest.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
            });
            if (!lr)
                return res.status(404).json({ message: "Leave request not found" });
            await prisma_1.prisma.leaveRequest.delete({ where: { id: lr.id } });
            return res.status(200).json({ message: "Leave request deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.LeaveRequestController = LeaveRequestController;
//# sourceMappingURL=LeaveRequestController.js.map