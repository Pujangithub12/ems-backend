import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";

export const ATTENDANCE_STATUSES = ["present", "absent", "on_leave"] as const;
type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
const isStatus = (v: unknown): v is AttendanceStatus => typeof v === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(v);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** "YYYY-MM-DD" -> a Date at UTC midnight (the column is a plain calendar date), or null when it isn't a real day. */
function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !DAY_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}
const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** "YYYY-MM" -> [first day, first day of next month) in UTC, or null. */
function parseMonth(value: unknown): { start: Date; end: Date } | null {
  if (typeof value !== "string" || !MONTH_RE.test(value)) return null;
  const start = new Date(`${value}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

const emptyCounts = () => ({ present: 0, absent: 0, on_leave: 0 });

/** Everyone who belongs to the current organization — the people attendance is taken for. */
async function organizationEmployees(organizationId: number) {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId },
    select: { role: true, user: { select: { id: true, fullName: true, email: true, jobPosition: true } } },
    orderBy: { user: { fullName: "asc" } },
  });
  return memberships.map((m) => ({ id: m.user.id, fullName: m.user.fullName, email: m.user.email, jobPosition: m.user.jobPosition ?? null, role: m.role }));
}

/** Daily attendance for the organization's employees. The routes gate who may call each handler (see routes.ts). */
export class AttendanceController {
  /** GET /attendance?date=YYYY-MM-DD — every employee with their status for that day (null = not taken yet). */
  static getDay = async (req: AuthRequest, res: Response) => {
    const day = parseDay(req.query.date);
    if (!day) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    try {
      const organizationId = req.organization!.id;
      const [employees, records] = await Promise.all([
        organizationEmployees(organizationId),
        prisma.attendance.findMany({ where: { organizationId, date: day }, select: { userId: true, status: true, note: true } }),
      ]);
      const byUser = new Map(records.map((r) => [r.userId, r] as const));
      return res.status(200).json({
        date: dayString(day),
        employees: employees.map((e) => ({ ...e, status: byUser.get(e.id)?.status ?? null, note: byUser.get(e.id)?.note ?? "" })),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /attendance — body { date, records: [{ userId, status, note? }] }. A status of "" / null clears that person's mark for the day. */
  static saveDay = async (req: AuthRequest, res: Response) => {
    const { date, records } = (req.body ?? {}) as { date?: unknown; records?: { userId?: unknown; status?: unknown; note?: unknown }[] };
    const day = parseDay(date);
    if (!day) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    if (day.getTime() > Date.now() + 36 * 60 * 60 * 1000) return res.status(400).json({ message: "Attendance can't be taken for a future date." });
    if (!Array.isArray(records) || records.length > 1000) return res.status(400).json({ message: "records must be an array" });

    try {
      const organizationId = req.organization!.id;
      const employees = await organizationEmployees(organizationId);
      const memberIds = new Set(employees.map((e) => e.id));

      const upserts: { userId: number; status: AttendanceStatus; note: string | null }[] = [];
      const clears: number[] = [];
      for (const r of records) {
        const userId = Number(r?.userId);
        if (!Number.isInteger(userId) || !memberIds.has(userId)) return res.status(400).json({ message: "Every record needs a valid employee." });
        if (r.status === "" || r.status == null) {
          clears.push(userId);
        } else if (isStatus(r.status)) {
          const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 500) : null;
          upserts.push({ userId, status: r.status, note });
        } else {
          return res.status(400).json({ message: `status must be one of: ${ATTENDANCE_STATUSES.join(", ")}` });
        }
      }

      await prisma.$transaction([
        ...(clears.length ? [prisma.attendance.deleteMany({ where: { organizationId, date: day, userId: { in: clears } } })] : []),
        ...upserts.map((u) =>
          prisma.attendance.upsert({
            where: { organizationId_userId_date: { organizationId, userId: u.userId, date: day } },
            create: { organizationId, userId: u.userId, date: day, status: u.status, note: u.note, markedById: req.user!.id },
            update: { status: u.status, note: u.note, markedById: req.user!.id },
          }),
        ),
      ]);
      return res.status(200).json({ message: "Attendance saved", saved: upserts.length, cleared: clears.length });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /attendance/summary?month=YYYY-MM — per-employee counts for the month, plus the date of every mark. */
  static getSummary = async (req: AuthRequest, res: Response) => {
    const range = parseMonth(req.query.month);
    if (!range) return res.status(400).json({ message: "month must be YYYY-MM" });
    try {
      const organizationId = req.organization!.id;
      const [employees, records] = await Promise.all([
        organizationEmployees(organizationId),
        prisma.attendance.findMany({
          where: { organizationId, date: { gte: range.start, lt: range.end } },
          select: { userId: true, date: true, status: true, note: true },
          orderBy: { date: "asc" },
        }),
      ]);
      const counts = new Map<number, ReturnType<typeof emptyCounts>>();
      // The day-by-day breakdown: which dates each employee was marked present / absent / on leave.
      const days = new Map<number, { date: string; status: AttendanceStatus; note: string }[]>();
      for (const r of records) {
        if (!isStatus(r.status)) continue;
        const c = counts.get(r.userId) ?? emptyCounts();
        c[r.status] += 1;
        counts.set(r.userId, c);
        const list = days.get(r.userId) ?? [];
        list.push({ date: dayString(r.date), status: r.status, note: r.note ?? "" });
        days.set(r.userId, list);
      }
      return res.status(200).json({
        month: String(req.query.month),
        employees: employees.map((e) => {
          const c = counts.get(e.id) ?? emptyCounts();
          return { ...e, ...c, marked: c.present + c.absent + c.on_leave, days: days.get(e.id) ?? [] };
        }),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /attendance/me?month=YYYY-MM — the caller's own marks for the month (any role). */
  static getMine = async (req: AuthRequest, res: Response) => {
    const range = parseMonth(req.query.month);
    if (!range) return res.status(400).json({ message: "month must be YYYY-MM" });
    try {
      const records = await prisma.attendance.findMany({
        where: { organizationId: req.organization!.id, userId: req.user!.id, date: { gte: range.start, lt: range.end } },
        select: { date: true, status: true, note: true },
        orderBy: { date: "asc" },
      });
      const counts = emptyCounts();
      for (const r of records) if (isStatus(r.status)) counts[r.status] += 1;
      return res.status(200).json({
        month: String(req.query.month),
        counts,
        records: records.map((r) => ({ date: dayString(r.date), status: r.status, note: r.note ?? "" })),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
