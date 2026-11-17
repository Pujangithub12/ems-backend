import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { CreateCalendarEventDto, CopyCalendarEventsDto } from "../dto/calendar-event.dto";
import { roleHasPermission } from "../utils/permissionService";

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

  /**
   * Copies events from the caller's current organization into one or more
   * other organizations they belong to. The caller needs the calendar.manage
   * permission in each *target* organization too (their role can differ per
   * organization) — a target they lack it in is reported as failed without
   * blocking the others. Events already present in a target (same title, date
   * and type) are skipped so re-running a copy never creates duplicates.
   */
  static copyEvents = async (req: AuthRequest, res: Response) => {
    const { targetOrganizationIds, eventIds }: CopyCalendarEventsDto = req.body;

    if (
      !Array.isArray(targetOrganizationIds) ||
      targetOrganizationIds.length === 0 ||
      targetOrganizationIds.some((i) => !Number.isInteger(i) || i <= 0)
    ) {
      return res.status(400).json({ message: "Select at least one organization to copy to" });
    }
    if (eventIds !== undefined && (!Array.isArray(eventIds) || eventIds.some((i) => !Number.isInteger(i)))) {
      return res.status(400).json({ message: "Invalid event list" });
    }

    try {
      const source = req.organization!;
      const targetIds = Array.from(new Set(targetOrganizationIds));
      if (targetIds.includes(source.id)) {
        return res.status(400).json({ message: "Choose organizations other than the current one" });
      }

      const events = await prisma.calendarEvent.findMany({
        where: {
          organizationId: source.id,
          ...(eventIds ? { id: { in: eventIds } } : {}),
        },
        orderBy: { date: "asc" },
      });
      if (events.length === 0) {
        return res.status(400).json({ message: "There are no events to copy" });
      }

      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: req.user!.id, organizationId: { in: targetIds } },
        include: { organization: true },
      });
      const membershipByOrg = new Map(memberships.map((m) => [m.organizationId, m]));

      const keyOf = (e: { title: string; date: Date; type: string }) =>
        `${e.title.trim().toLowerCase()}|${e.date.getTime()}|${e.type}`;

      type Result = {
        organizationId: number;
        organizationName: string;
        copied: number;
        skipped: number;
        error?: string;
      };
      const results: Result[] = [];

      for (const targetId of targetIds) {
        const membership = membershipByOrg.get(targetId);
        if (!membership) {
          results.push({
            organizationId: targetId,
            organizationName: `Organization ${targetId}`,
            copied: 0,
            skipped: 0,
            error: "You are not a member of this organization",
          });
          continue;
        }
        const name = membership.organization.name;
        if (!(await roleHasPermission(membership.role, "calendar.manage"))) {
          results.push({
            organizationId: targetId,
            organizationName: name,
            copied: 0,
            skipped: 0,
            error: "You don't have permission to manage the calendar here",
          });
          continue;
        }

        try {
          const existing = await prisma.calendarEvent.findMany({
            where: { organizationId: targetId },
            select: { title: true, date: true, type: true },
          });
          const seen = new Set(existing.map(keyOf));
          const toCreate = events.filter((e) => {
            const k = keyOf(e);
            if (seen.has(k)) return false;
            seen.add(k); // also dedupes within the copied batch itself
            return true;
          });
          if (toCreate.length > 0) {
            await prisma.calendarEvent.createMany({
              data: toCreate.map((e) => ({
                title: e.title,
                date: e.date,
                type: e.type,
                organizationId: targetId,
              })),
            });
          }
          results.push({
            organizationId: targetId,
            organizationName: name,
            copied: toCreate.length,
            skipped: events.length - toCreate.length,
          });
        } catch (err) {
          console.error(err);
          results.push({
            organizationId: targetId,
            organizationName: name,
            copied: 0,
            skipped: 0,
            error: "Failed to copy events",
          });
        }
      }

      return res.status(200).json({ results });
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
