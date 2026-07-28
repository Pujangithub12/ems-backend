"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementController = void 0;
const prisma_1 = require("../config/prisma");
const emailService_1 = require("../utils/emailService");
const simpleArray_1 = require("../utils/simpleArray");
class AnnouncementController {
    static createAnnouncement = async (req, res) => {
        const { subject, message, targetType, targetEmails } = req.body;
        if (!subject || !message || !targetType) {
            return res
                .status(400)
                .json({ message: "Subject, message, and targetType are required" });
        }
        try {
            let recipientEmails = [];
            if (targetType === "all") {
                const users = await prisma_1.prisma.user.findMany({ select: { email: true } });
                // Filter out users who don't have an email address
                recipientEmails = users.map((u) => u.email).filter((email) => email);
            }
            else if (targetType === "specific" && Array.isArray(targetEmails)) {
                recipientEmails = targetEmails;
            }
            else {
                return res.status(400).json({
                    message: "Invalid targetType or missing targetEmails",
                });
            }
            if (recipientEmails.length === 0) {
                return res.status(400).json({ message: "No recipients found" });
            }
            const organization = req.organization;
            // Save to history
            const newAnnouncement = await prisma_1.prisma.announcement.create({
                data: {
                    subject,
                    message,
                    targetType,
                    targetEmails: (0, simpleArray_1.fromSimpleArray)(targetType === "specific" ? recipientEmails : []),
                    organizationId: organization.id,
                },
            });
            (0, emailService_1.sendEmail)(recipientEmails, subject, message, undefined, "announcement").catch((err) => {
                console.error("Failed to send announcement emails:", err);
            });
            return res.status(201).json({
                message: "Announcement created and emails are being sent",
                announcement: { ...newAnnouncement, targetEmails: (0, simpleArray_1.toSimpleArray)(newAnnouncement.targetEmails) },
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getHistory = async (req, res) => {
        try {
            const organization = req.organization;
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const history = await prisma_1.prisma.announcement.findMany({
                where: {
                    organizationId: organization.id,
                    createdAt: { gte: sevenDaysAgo },
                },
                orderBy: { createdAt: "desc" },
            });
            return res
                .status(200)
                .json(history.map((h) => ({ ...h, targetEmails: (0, simpleArray_1.toSimpleArray)(h.targetEmails) })));
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteAnnouncement = async (req, res) => {
        const { id } = req.params;
        // Check if id exists
        if (!id) {
            return res.status(400).json({ message: "ID is required" });
        }
        try {
            const organization = req.organization;
            const announcement = await prisma_1.prisma.announcement.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
            });
            if (!announcement) {
                return res.status(404).json({ message: "Announcement not found" });
            }
            await prisma_1.prisma.announcement.delete({ where: { id: announcement.id } });
            return res
                .status(200)
                .json({ message: "Announcement history deleted successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.AnnouncementController = AnnouncementController;
//# sourceMappingURL=AnnouncementController.js.map