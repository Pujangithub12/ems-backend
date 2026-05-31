"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementController = void 0;
const data_source_1 = require("../config/data-source");
const Announcement_1 = require("../entities/Announcement");
const User_1 = require("../entities/User");
const emailService_1 = require("../utils/emailService");
class AnnouncementController {
    static createAnnouncement = async (req, res) => {
        const { subject, message, targetType, targetEmails } = req.body;
        if (!subject || !message || !targetType) {
            return res.status(400).json({ message: "Subject, message, and targetType are required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const announcementRepository = data_source_1.AppDataSource.getRepository(Announcement_1.Announcement);
            let recipientEmails = [];
            if (targetType === "all") {
                const users = await userRepository.find({ select: ["email"] });
                recipientEmails = users.map(u => u.email);
            }
            else if (targetType === "specific" && Array.isArray(targetEmails)) {
                recipientEmails = targetEmails;
            }
            else {
                return res.status(400).json({ message: "Invalid targetType or missing targetEmails" });
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
            (0, emailService_1.sendEmail)(recipientEmails, subject, message).catch(err => {
                console.error("Failed to send announcement emails:", err);
            });
            return res.status(201).json({
                message: "Announcement created and emails are being sent",
                announcement: newAnnouncement
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getHistory = async (req, res) => {
        try {
            const announcementRepository = data_source_1.AppDataSource.getRepository(Announcement_1.Announcement);
            const history = await announcementRepository.find({
                order: { createdAt: "DESC" }
            });
            return res.status(200).json(history);
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
            const announcementRepository = data_source_1.AppDataSource.getRepository(Announcement_1.Announcement);
            // Cast id to string for parseInt
            const announcement = await announcementRepository.findOne({
                where: { id: parseInt(id) },
            });
            if (!announcement) {
                return res.status(404).json({ message: "Announcement not found" });
            }
            await announcementRepository.remove(announcement);
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