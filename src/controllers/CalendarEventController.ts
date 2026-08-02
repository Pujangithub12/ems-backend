import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { CreateCalendarEventDto } from "../dto/calendar-event.dto";

export class CalendarEventController {
  static getAllEvents = async (req: AuthRequest, res: Response) => {
    try {
      const organization = req.organization!;
      const events = await prisma.calendarEvent.findMany({
        where: { organizationId: organization.id },
        orderBy: { date: "asc" },
      });
      return res.status(200).json(events);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static createEvent = async (req: AuthRequest, res: Response) => {
    const { title, date, type }: CreateCalendarEventDto = req.body;

    if (!title || !date) {
      return res.status(400).json({ message: "Title and date are required" });
    }

    try {
      const organization = req.organization!;
      const newEvent = await prisma.calendarEvent.create({
        data: {
          title,
          date: new Date(date),
          type: type || "holiday",
          organizationId: organization.id,
        },
      });

      return res.status(201).json(newEvent);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static deleteEvent = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    try {
      const organization = req.organization!;
      const event = await prisma.calendarEvent.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: organization.id,
        },
      });

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      await prisma.calendarEvent.delete({ where: { id: event.id } });
      return res.status(200).json({ message: "Event deleted successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
