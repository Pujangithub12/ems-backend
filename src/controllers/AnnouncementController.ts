import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Announcement } from "../entities/Announcement";
import { User } from "../entities/User";
import { sendEmail } from "../utils/emailService";

export class AnnouncementController {
    static createAnnouncement = async (req: Request, res: Response) => {
        const { subject, message, targetType, targetEmails } = req.body;

        if (!subject || !message || !targetType) {
            return res.status(400).json({ message: "Subject, message, and targetType are required" });
        }

        try {
            const userRepository = AppDataSource.getRepository(User);
            const announcementRepository = AppDataSource.getRepository(Announcement);

            let recipientEmails: string[] = [];

            if (targetType === "all") {
              const users = await userRepository.find({ select: ["email"] });
              // Filter out users who don't have an email address
              recipientEmails = users
                .map((u) => u.email)
                .filter((email) => email);
            } else if (
              targetType === "specific" &&
              Array.isArray(targetEmails)
            ) {
              recipientEmails = targetEmails;
            } else {
              return res
                .status(400)
                .json({
                  message: "Invalid targetType or missing targetEmails",
                });
            }

            if (recipientEmails.length === 0) {
                return res.status(400).json({ message: "No recipients found" });
            }

            // Save to history
            const newAnnouncement = announcementRepository.create({
                subject,
                message,
                targetType,
                targetEmails: targetType === "specific" ? recipientEmails : []
            });
            await announcementRepository.save(newAnnouncement);

            // Send emails (in background, don't block response)
            sendEmail(recipientEmails, subject, message).catch(err => {
                console.error("Failed to send announcement emails:", err);
            });

            return res.status(201).json({
                message: "Announcement created and emails are being sent",
                announcement: newAnnouncement
            });
        } catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };

    static getHistory = async (req: Request, res: Response) => {
        try {
            const announcementRepository = AppDataSource.getRepository(Announcement);
            const history = await announcementRepository.find({
                order: { createdAt: "DESC" }
            });
            return res.status(200).json(history);
        } catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };

    static deleteAnnouncement = async (req: Request, res: Response) => {
        const { id } = req.params;
        // Check if id exists
        if (!id) {
          return res.status(400).json({ message: "ID is required" });
        }

        try {
          const announcementRepository =
            AppDataSource.getRepository(Announcement);
          // Cast id to string for parseInt
          const announcement = await announcementRepository.findOne({
            where: { id: parseInt(id as string) },
          });

          if (!announcement) {
            return res.status(404).json({ message: "Announcement not found" });
          }

          await announcementRepository.remove(announcement);
          return res
            .status(200)
            .json({ message: "Announcement history deleted successfully" });
        } catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
