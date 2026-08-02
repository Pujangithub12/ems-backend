"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const prisma_1 = require("../config/prisma");
class NotificationController {
    static list = async (req, res) => {
        try {
            const userId = req.user.id;
            const organizationId = req.organization.id;
            const limit = Math.min(Number(req.query.limit) || 30, 100);
            const notifications = await prisma_1.prisma.notification.findMany({
                where: { userId, organizationId },
                orderBy: { createdAt: "desc" },
                take: limit,
            });
            return res.status(200).json(notifications);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static unreadCount = async (req, res) => {
        try {
            const userId = req.user.id;
            const organizationId = req.organization.id;
            const count = await prisma_1.prisma.notification.count({
                where: { userId, organizationId, isRead: false },
            });
            return res.status(200).json({ count });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static markRead = async (req, res) => {
        try {
            const userId = req.user.id;
            const id = parseInt(req.params.id);
            const notification = await prisma_1.prisma.notification.findFirst({ where: { id, userId } });
            if (!notification)
                return res.status(404).json({ message: "Notification not found" });
            const updated = await prisma_1.prisma.notification.update({
                where: { id },
                data: { isRead: true },
            });
            return res.status(200).json(updated);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static markAllRead = async (req, res) => {
        try {
            const userId = req.user.id;
            const organizationId = req.organization.id;
            await prisma_1.prisma.notification.updateMany({
                where: { userId, organizationId, isRead: false },
                data: { isRead: true },
            });
            return res.status(200).json({ message: "All notifications marked as read" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.NotificationController = NotificationController;
//# sourceMappingURL=NotificationController.js.map