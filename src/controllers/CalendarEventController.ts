import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CalendarEvent } from "../entities/CalendarEvent";
import { AuthRequest } from "../middlewares/auth";
import { CreateCalendarEventDto } from "../dto/calendar-event.dto";

export class CalendarEventController {
  static getAllEvents = async (req: AuthRequest, res: Response) => {
    try {
      const eventRepository = AppDataSource.getRepository(CalendarEvent);
      const workspace = req.workspace!;
      const events = await eventRepository.find({
        where: { workspace: { id: workspace.id } },
        order: { date: "ASC" },
      });
      return res.status(200).json(events);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static createEvent = async (req: AuthRequest, res: Response) => {
    const { title, date, type }: CreateCalendarEventDto = req.body;

    if (!title || !date) {
      return res.status(400).json({ message: "Title and date are required" });
    }

    try {
      const eventRepository = AppDataSource.getRepository(CalendarEvent);
      const workspace = req.workspace!;
      const newEvent = eventRepository.create({
        title,
        date: new Date(date),
        type: type || "holiday",
        workspace
      });

      await eventRepository.save(newEvent);
      return res.status(201).json(newEvent);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteEvent = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    try {
      const eventRepository = AppDataSource.getRepository(CalendarEvent);
      const workspace = req.workspace!;
      const event = await eventRepository.findOneBy({
        id: parseInt(id as string),
        workspace: { id: workspace.id }
      });

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      await eventRepository.remove(event);
      return res.status(200).json({ message: "Event deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
