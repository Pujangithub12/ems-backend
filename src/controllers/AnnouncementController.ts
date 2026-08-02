import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { sendEmail } from "../utils/emailService";
import { AuthRequest } from "../middlewares/auth";
import { CreateAnnouncementDto } from "../dto/announcement.dto";
import { toSimpleArray, fromSimpleArray } from "../utils/simpleArray";
import { notifyOrganization } from "../services/notificationService";

export class AnnouncementController {
  static createAnnouncement = async (req: AuthRequest, res: Response) => {
    const { subject, message, targetType, targetEmails }: CreateAnnouncementDto =
      req.body;

    if (!subject || !message || !targetType) {
      return res
        .status(400)
        .json({ message: "Subject, message, and targetType are required" });
    }

    try {
      let recipientEmails: string[] = [];

      if (targetType === "all") {
        const users = await prisma.user.findMany({ select: { email: true } });
        // Filter out users who don't have an email address
        recipientEmails = users.map((u) => u.email).filter((email) => email);
      } else if (targetType === "specific" && Array.isArray(targetEmails)) {
        recipientEmails = targetEmails;
      } else {
        return res.status(400).json({
          message: "Invalid targetType or missing targetEmails",
        });
      }

      if (recipientEmails.length === 0) {
        return res.status(400).json({ message: "No recipients found" });
      }

      const organization = req.organization!;

      // Save to history
      const newAnnouncement = await prisma.announcement.create({
        data: {
          subject,
          message,
          targetType,
          targetEmails: fromSimpleArray(targetType === "specific" ? recipientEmails : []),
          organizationId: organization.id,
        },
      });

      sendEmail(recipientEmails, subject, message, undefined, "announcement").catch((err) => {
        console.error("Failed to send announcement emails:", err);
      });

      notifyOrganization(
        organization.id,
        {
          organizationId: organization.id,
          type: "announcement",
          title: subject,
          message,
          link: `/${organization.id}/announcements`,
        },
        req.user?.id,
      ).catch((err) => console.error("Failed to send announcement notification:", err));

      return res.status(201).json({
        message: "Announcement created and emails are being sent",
        announcement: { ...newAnnouncement, targetEmails: toSimpleArray(newAnnouncement.targetEmails) },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static getHistory = async (req: AuthRequest, res: Response) => {
    try {
      const organization = req.organization!;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const history = await prisma.announcement.findMany({
        where: {
          organizationId: organization.id,
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      return res
        .status(200)
        .json(history.map((h) => ({ ...h, targetEmails: toSimpleArray(h.targetEmails) })));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static deleteAnnouncement = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    // Check if id exists
    if (!id) {
      return res.status(400).json({ message: "ID is required" });
    }

    try {
      const organization = req.organization!;
      const announcement = await prisma.announcement.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
      });

      if (!announcement) {
        return res.status(404).json({ message: "Announcement not found" });
      }

      await prisma.announcement.delete({ where: { id: announcement.id } });
      return res
        .status(200)
        .json({ message: "Announcement history deleted successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
