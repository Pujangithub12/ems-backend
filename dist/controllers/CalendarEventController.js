"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarEventController = void 0;
const prisma_1 = require("../config/prisma");
class CalendarEventController {
    static getAllEvents = async (req, res) => {
        try {
            const organization = req.organization;
            const events = await prisma_1.prisma.calendarEvent.findMany({
                where: { organizationId: organization.id },
                orderBy: { date: "asc" },
            });
            return res.status(200).json(events);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static createEvent = async (req, res) => {
        const { title, date, type } = req.body;
        if (!title || !date) {
            return res.status(400).json({ message: "Title and date are required" });
        }
        try {
            const organization = req.organization;
            const newEvent = await prisma_1.prisma.calendarEvent.create({
                data: {
                    title,
                    date: new Date(date),
                    type: type || "holiday",
                    organizationId: organization.id,
                },
            });
            return res.status(201).json(newEvent);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteEvent = async (req, res) => {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Event ID is required" });
        }
        try {
            const organization = req.organization;
            const event = await prisma_1.prisma.calendarEvent.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: organization.id,
                },
            });
            if (!event) {
                return res.status(404).json({ message: "Event not found" });
            }
            await prisma_1.prisma.calendarEvent.delete({ where: { id: event.id } });
            return res.status(200).json({ message: "Event deleted successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.CalendarEventController = CalendarEventController;
//# sourceMappingURL=CalendarEventController.js.map