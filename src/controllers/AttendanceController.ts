import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";

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

const cleanText = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The people attendance is taken for in this organization — typed in by an admin, in the order they were added. */
async function organizationEmployees(organizationId: number) {
  const employees = await prisma.attendanceEmployee.findMany({
    where: { organizationId },
    select: { id: true, name: true, position: true },
    orderBy: { id: "asc" },
  });
  return employees.map((e) => ({ id: e.id, name: e.name, position: e.position ?? null }));
}

type ShareResult = {
  organizationId: number;
  organizationName: string;
  employeesAdded: number;
  employeesMatched: number;
  marksCopied: number;
  error?: string;
};

/** Daily attendance for the organization's own employee list. Admin / super admin only (see routes.ts). */
export class AttendanceController {
  /** POST /attendance/employees — body { name, position? }. */
  static createEmployee = async (req: AuthRequest, res: Response) => {
    const name = cleanText(req.body?.name, 120);
    if (!name) return res.status(400).json({ message: "Employee name is required." });
    try {
      const employee = await prisma.attendanceEmployee.create({
        data: { organizationId: req.organization!.id, name, position: cleanText(req.body?.position, 120) },
        select: { id: true, name: true, position: true },
      });
      return res.status(201).json({ employee });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /attendance/employees/:id — rename / change position. */
  static updateEmployee = async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    const name = cleanText(req.body?.name, 120);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid employee" });
    if (!name) return res.status(400).json({ message: "Employee name is required." });
    try {
      const existing = await prisma.attendanceEmployee.findFirst({ where: { id, organizationId: req.organization!.id }, select: { id: true } });
      if (!existing) return res.status(404).json({ message: "Employee not found" });
      const employee = await prisma.attendanceEmployee.update({
        where: { id },
        data: { name, position: cleanText(req.body?.position, 120) },
        select: { id: true, name: true, position: true },
      });
      return res.status(200).json({ employee });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /attendance/employees/:id — removes the employee and all their attendance marks. */
  static deleteEmployee = async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid employee" });
    try {
      const existing = await prisma.attendanceEmployee.findFirst({ where: { id, organizationId: req.organization!.id }, select: { id: true } });
      if (!existing) return res.status(404).json({ message: "Employee not found" });
      await prisma.attendanceEmployee.delete({ where: { id } });
      return res.status(200).json({ message: "Employee removed" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * POST /attendance/share — body { targetOrganizationIds: number[], includeAttendance?: boolean }.
   * Copies this organization's attendance employees (and, unless includeAttendance is false, all of their marks)
   * into each target organization. Employees are matched to existing ones in the target by name (so sharing again
   * refreshes instead of duplicating); marks for the same person and day are overwritten with this organization's.
   * The caller must be an admin / super admin of every target organization.
   */
  static share = async (req: AuthRequest, res: Response) => {
    const { targetOrganizationIds, includeAttendance } = (req.body ?? {}) as { targetOrganizationIds?: unknown; includeAttendance?: unknown };
    if (!Array.isArray(targetOrganizationIds) || targetOrganizationIds.length === 0 || targetOrganizationIds.some((i) => !Number.isInteger(i) || i <= 0)) {
      return res.status(400).json({ message: "Select at least one organization to share with" });
    }
    const withMarks = includeAttendance !== false;

    try {
      const source = req.organization!;
      const targetIds = Array.from(new Set(targetOrganizationIds as number[]));
      if (targetIds.includes(source.id)) return res.status(400).json({ message: "Choose organizations other than the current one" });

      const employees = await prisma.attendanceEmployee.findMany({
        where: { organizationId: source.id },
        select: { id: true, name: true, position: true },
        orderBy: { id: "asc" },
      });
      if (employees.length === 0) return res.status(400).json({ message: "Add some employees before sharing" });
      const marks = withMarks
        ? await prisma.attendance.findMany({ where: { organizationId: source.id }, select: { employeeId: true, date: true, status: true, note: true } })
        : [];

      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: req.user!.id, organizationId: { in: targetIds } },
        include: { organization: true },
      });
      const membershipByOrg = new Map(memberships.map((m) => [m.organizationId, m] as const));
      const nameKey = (n: string) => n.trim().toLowerCase();

      const results: ShareResult[] = [];
      for (const targetId of targetIds) {
        const membership = membershipByOrg.get(targetId);
        const base = { organizationId: targetId, organizationName: membership?.organization.name ?? `Organization ${targetId}`, employeesAdded: 0, employeesMatched: 0, marksCopied: 0 };
        if (!membership) {
          results.push({ ...base, error: "You are not a member of this organization" });
          continue;
        }
        if (membership.role !== UserRole.ADMIN && membership.role !== UserRole.SUPER_ADMIN) {
          results.push({ ...base, error: "You need to be an admin of this organization" });
          continue;
        }

        try {
          // Match each source employee to an existing one in the target by name (each target person used once, so two
          // people who share a name stay two people); create the rest.
          const existing = await prisma.attendanceEmployee.findMany({ where: { organizationId: targetId }, orderBy: { id: "asc" }, select: { id: true, name: true } });
          const available = new Map<string, number[]>();
          for (const e of existing) available.set(nameKey(e.name), [...(available.get(nameKey(e.name)) ?? []), e.id]);

          const targetIdBySource = new Map<number, number>();
          for (const e of employees) {
            const matched = available.get(nameKey(e.name))?.shift();
            if (matched !== undefined) {
              targetIdBySource.set(e.id, matched);
              base.employeesMatched += 1;
            } else {
              const created = await prisma.attendanceEmployee.create({ data: { organizationId: targetId, name: e.name, position: e.position }, select: { id: true } });
              targetIdBySource.set(e.id, created.id);
              base.employeesAdded += 1;
            }
          }

          const upserts = marks.flatMap((m) => {
            const employeeId = targetIdBySource.get(m.employeeId);
            return employeeId === undefined
              ? []
              : [
                  prisma.attendance.upsert({
                    where: { organizationId_employeeId_date: { organizationId: targetId, employeeId, date: m.date } },
                    create: { organizationId: targetId, employeeId, date: m.date, status: m.status, note: m.note, markedById: req.user!.id },
                    update: { status: m.status, note: m.note, markedById: req.user!.id },
                  }),
                ];
          });
          for (let i = 0; i < upserts.length; i += 200) {
            // eslint-disable-next-line no-await-in-loop -- batches keep each transaction small
            await prisma.$transaction(upserts.slice(i, i + 200));
          }
          base.marksCopied = upserts.length;
          results.push(base);
        } catch (error) {
          console.error(error);
          results.push({ ...base, error: "Something went wrong while sharing with this organization" });
        }
      }
      return res.status(200).json({ results });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /attendance?date=YYYY-MM-DD — every employee with their status for that day (null = not taken yet). */
  static getDay = async (req: AuthRequest, res: Response) => {
    const day = parseDay(req.query.date);
    if (!day) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    try {
      const organizationId = req.organization!.id;
      const [employees, records] = await Promise.all([
        organizationEmployees(organizationId),
        prisma.attendance.findMany({ where: { organizationId, date: day }, select: { employeeId: true, status: true, note: true } }),
      ]);
      const byEmployee = new Map(records.map((r) => [r.employeeId, r] as const));
      return res.status(200).json({
        date: dayString(day),
        employees: employees.map((e) => ({ ...e, status: byEmployee.get(e.id)?.status ?? null, note: byEmployee.get(e.id)?.note ?? "" })),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /attendance — body { date, records: [{ employeeId, status, note? }] }. A status of "" / null clears that person's mark for the day. */
  static saveDay = async (req: AuthRequest, res: Response) => {
    const { date, records } = (req.body ?? {}) as { date?: unknown; records?: { employeeId?: unknown; status?: unknown; note?: unknown }[] };
    const day = parseDay(date);
    if (!day) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    if (day.getTime() > Date.now() + 36 * 60 * 60 * 1000) return res.status(400).json({ message: "Attendance can't be taken for a future date." });
    if (!Array.isArray(records) || records.length > 1000) return res.status(400).json({ message: "records must be an array" });

    try {
      const organizationId = req.organization!.id;
      const employees = await organizationEmployees(organizationId);
      const knownIds = new Set(employees.map((e) => e.id));

      const upserts: { employeeId: number; status: AttendanceStatus; note: string | null }[] = [];
      const clears: number[] = [];
      for (const r of records) {
        const employeeId = Number(r?.employeeId);
        if (!Number.isInteger(employeeId) || !knownIds.has(employeeId)) return res.status(400).json({ message: "Every record needs a valid employee." });
        if (r.status === "" || r.status == null) {
          clears.push(employeeId);
        } else if (isStatus(r.status)) {
          upserts.push({ employeeId, status: r.status, note: cleanText(r.note, 500) });
        } else {
          return res.status(400).json({ message: `status must be one of: ${ATTENDANCE_STATUSES.join(", ")}` });
        }
      }

      await prisma.$transaction([
        ...(clears.length ? [prisma.attendance.deleteMany({ where: { organizationId, date: day, employeeId: { in: clears } } })] : []),
        ...upserts.map((u) =>
          prisma.attendance.upsert({
            where: { organizationId_employeeId_date: { organizationId, employeeId: u.employeeId, date: day } },
            create: { organizationId, employeeId: u.employeeId, date: day, status: u.status, note: u.note, markedById: req.user!.id },
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
          select: { employeeId: true, date: true, status: true, note: true },
          orderBy: { date: "asc" },
        }),
      ]);
      const counts = new Map<number, ReturnType<typeof emptyCounts>>();
      // The day-by-day breakdown: which dates each employee was marked present / absent / on leave.
      const days = new Map<number, { date: string; status: AttendanceStatus; note: string }[]>();
      for (const r of records) {
        if (!isStatus(r.status)) continue;
        const c = counts.get(r.employeeId) ?? emptyCounts();
        c[r.status] += 1;
        counts.set(r.employeeId, c);
        const list = days.get(r.employeeId) ?? [];
        list.push({ date: dayString(r.date), status: r.status, note: r.note ?? "" });
        days.set(r.employeeId, list);
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
}
