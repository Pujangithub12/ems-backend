import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";

export class NotificationController {
  static list = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const organizationId = req.organization!.id;
      const limit = Math.min(Number(req.query.limit) || 30, 100);

      const notifications = await prisma.notification.findMany({
        where: { userId, organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return res.status(200).json(notifications);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static unreadCount = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const organizationId = req.organization!.id;

      const count = await prisma.notification.count({
        where: { userId, organizationId, isRead: false },
      });

      return res.status(200).json({ count });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static markRead = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = parseInt(req.params.id as string);

      const notification = await prisma.notification.findFirst({ where: { id, userId } });
      if (!notification) return res.status(404).json({ message: "Notification not found" });

      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      return res.status(200).json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static markAllRead = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const organizationId = req.organization!.id;

      await prisma.notification.updateMany({
        where: { userId, organizationId, isRead: false },
        data: { isRead: true },
      });

      return res.status(200).json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
