"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarEventController = void 0;
const data_source_1 = require("../config/data-source");
const CalendarEvent_1 = require("../entities/CalendarEvent");
class CalendarEventController {
    static getAllEvents = async (req, res) => {
        try {
            const eventRepository = data_source_1.AppDataSource.getRepository(CalendarEvent_1.CalendarEvent);
            const events = await eventRepository.find({
                order: { date: "ASC" },
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
            const eventRepository = data_source_1.AppDataSource.getRepository(CalendarEvent_1.CalendarEvent);
            const newEvent = eventRepository.create({
                title,
                date: new Date(date),
                type: type || "holiday",
            });
            await eventRepository.save(newEvent);
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
            const eventRepository = data_source_1.AppDataSource.getRepository(CalendarEvent_1.CalendarEvent);
            const event = await eventRepository.findOneBy({
                id: parseInt(id),
            });
            if (!event) {
                return res.status(404).json({ message: "Event not found" });
            }
            await eventRepository.remove(event);
            return res.status(200).json({ message: "Event deleted successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.CalendarEventController = CalendarEventController;
//# sourceMappingURL=CalendarEventController.js.map