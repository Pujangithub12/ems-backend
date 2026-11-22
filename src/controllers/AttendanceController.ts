import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { attendancePermissions } from "../utils/attendanceAccess";

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

/**
 * Attendance data (employees + marks) is stored under one "data organization". Normally that is the caller's own
 * organization; when it has been linked to another organization's attendance (see AttendanceShare) that other
 * organization is the data owner, so admins of every linked organization read and write the very same list.
 */
async function dataOrganizationId(organizationId: number): Promise<number> {
  const link = await prisma.attendanceShare.findUnique({ where: { memberOrganizationId: organizationId }, select: { ownerOrganizationId: true } });
  return link?.ownerOrganizationId ?? organizationId;
}

/** The people attendance is taken for, in the order they were added. */
async function organizationEmployees(organizationId: number) {
  const employees = await prisma.attendanceEmployee.findMany({
    where: { organizationId },
    select: { id: true, name: true, position: true, company: true },
    orderBy: { id: "asc" },
  });
  return employees.map((e) => ({ id: e.id, name: e.name, position: e.position ?? null, company: e.company ?? null }));
}

const isAdminRole = (role: string) => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

/** Daily attendance for the organization's employee list (possibly shared with other organizations). Admin / super admin only (see routes.ts). */
export class AttendanceController {
  // ---------------------------------------------------------------------------------------------
  // Access: who may view / edit / manage this page (see utils/attendanceAccess.ts)
  // ---------------------------------------------------------------------------------------------

  /** GET /attendance/permissions — what the caller may do on the Attendance page (any signed-in member). */
  static getPermissions = async (req: AuthRequest, res: Response) => {
    try {
      return res.status(200).json(await attendancePermissions(req));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /attendance/access — the organization's members and which of them may edit. Super admin only. */
  static getAccess = async (req: AuthRequest, res: Response) => {
    try {
      const organizationId = req.organization!.id;
      const [memberships, editors] = await Promise.all([
        prisma.organizationMembership.findMany({
          where: { organizationId, role: { not: UserRole.SUPER_ADMIN } },
          select: { role: true, user: { select: { id: true, fullName: true, email: true } } },
          orderBy: { user: { fullName: "asc" } },
        }),
        prisma.attendanceEditor.findMany({ where: { organizationId }, select: { userId: true } }),
      ]);
      const editorIds = new Set(editors.map((e) => e.userId));
      return res.status(200).json({
        members: memberships.map((m) => ({ id: m.user.id, fullName: m.user.fullName, email: m.user.email, role: m.role, canEdit: editorIds.has(m.user.id) })),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /attendance/access — body { userIds: number[] }: full-replace of the people who may edit. Super admin only. */
  static saveAccess = async (req: AuthRequest, res: Response) => {
    const { userIds } = (req.body ?? {}) as { userIds?: unknown };
    if (!Array.isArray(userIds) || userIds.some((i) => !Number.isInteger(i))) return res.status(400).json({ message: "userIds must be a list of user ids" });
    try {
      const organizationId = req.organization!.id;
      const wanted = Array.from(new Set(userIds as number[]));
      const members = await prisma.organizationMembership.findMany({
        where: { organizationId, userId: { in: wanted }, role: { not: UserRole.SUPER_ADMIN } },
        select: { userId: true },
      });
      const allowed = new Set(members.map((m) => m.userId));
      if (wanted.some((id) => !allowed.has(id))) return res.status(400).json({ message: "You can only give access to members of this organization." });

      await prisma.$transaction([
        prisma.attendanceEditor.deleteMany({ where: { organizationId } }),
        prisma.attendanceEditor.createMany({ data: wanted.map((userId) => ({ organizationId, userId, grantedById: req.user!.id })) }),
      ]);
      return res.status(200).json({ message: "Access updated", editors: wanted.length });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Live sharing between organizations
  // ---------------------------------------------------------------------------------------------

  /** GET /attendance/sharing — who this organization's attendance is shared with, and which organizations it could be shared with. */
  static getSharing = async (req: AuthRequest, res: Response) => {
    try {
      const currentId = req.organization!.id;
      const rootId = await dataOrganizationId(currentId);
      const [root, members] = await Promise.all([
        prisma.organization.findUnique({ where: { id: rootId }, select: { id: true, name: true } }),
        prisma.attendanceShare.findMany({ where: { ownerOrganizationId: rootId }, select: { member: { select: { id: true, name: true } } }, orderBy: { id: "asc" } }),
      ]);
      const groupIds = new Set([rootId, ...members.map((m) => m.member.id)]);
      const role = rootId !== currentId ? "member" : members.length > 0 ? "owner" : "none";

      // Organizations the caller administers that could still join: not already linked, not using someone else's
      // attendance, and not owning a shared list of their own.
      const adminMemberships = await prisma.organizationMembership.findMany({
        where: { userId: req.user!.id, role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, organizationId: { notIn: [...groupIds] } },
        select: { organization: { select: { id: true, name: true } } },
        orderBy: { organization: { name: "asc" } },
      });
      const candidateIds = adminMemberships.map((m) => m.organization.id);
      const [asMember, asOwner, ownCounts] = await Promise.all([
        prisma.attendanceShare.findMany({ where: { memberOrganizationId: { in: candidateIds } }, select: { memberOrganizationId: true } }),
        prisma.attendanceShare.findMany({ where: { ownerOrganizationId: { in: candidateIds } }, select: { ownerOrganizationId: true } }),
        prisma.attendanceEmployee.groupBy({ by: ["organizationId"], where: { organizationId: { in: candidateIds } }, _count: { _all: true } }),
      ]);
      const unavailable = new Set([...asMember.map((r) => r.memberOrganizationId), ...asOwner.map((r) => r.ownerOrganizationId)]);
      const ownData = new Map(ownCounts.map((c) => [c.organizationId, c._count._all] as const));

      return res.status(200).json({
        role,
        owner: rootId !== currentId ? root : null,
        // Every other organization on the same list. The owner can remove any of them; a member can only leave.
        linked: [
          ...(rootId !== currentId && root ? [{ id: root.id, name: root.name, isOwner: true }] : []),
          ...members.filter((m) => m.member.id !== currentId).map((m) => ({ id: m.member.id, name: m.member.name, isOwner: false })),
        ],
        candidates: adminMemberships
          .filter((m) => !unavailable.has(m.organization.id))
          .map((m) => ({ id: m.organization.id, name: m.organization.name, hasOwnData: (ownData.get(m.organization.id) ?? 0) > 0 })),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * POST /attendance/sharing — body { targetOrganizationIds }. Links each target organization to this attendance list:
   * from then on its Attendance page shows (and edits) the same employees and marks. The caller must be an admin /
   * super admin of every target. A target's own earlier attendance data is kept but hidden while it is linked.
   */
  static addSharing = async (req: AuthRequest, res: Response) => {
    const { targetOrganizationIds } = (req.body ?? {}) as { targetOrganizationIds?: unknown };
    if (!Array.isArray(targetOrganizationIds) || targetOrganizationIds.length === 0 || targetOrganizationIds.some((i) => !Number.isInteger(i) || i <= 0)) {
      return res.status(400).json({ message: "Select at least one organization to share with" });
    }
    try {
      const rootId = await dataOrganizationId(req.organization!.id);
      const targetIds = Array.from(new Set(targetOrganizationIds as number[]));

      const [memberships, alreadyMember, ownerOfOthers, groupMembers] = await Promise.all([
        prisma.organizationMembership.findMany({ where: { userId: req.user!.id, organizationId: { in: targetIds } }, include: { organization: true } }),
        prisma.attendanceShare.findMany({ where: { memberOrganizationId: { in: targetIds } }, select: { memberOrganizationId: true } }),
        prisma.attendanceShare.findMany({ where: { ownerOrganizationId: { in: targetIds } }, select: { ownerOrganizationId: true } }),
        prisma.attendanceShare.findMany({ where: { ownerOrganizationId: rootId }, select: { memberOrganizationId: true } }),
      ]);
      const membershipByOrg = new Map(memberships.map((m) => [m.organizationId, m] as const));
      const memberSet = new Set(alreadyMember.map((r) => r.memberOrganizationId));
      const ownerSet = new Set(ownerOfOthers.map((r) => r.ownerOrganizationId));
      const inGroup = new Set([rootId, ...groupMembers.map((g) => g.memberOrganizationId)]);

      const results: { organizationId: number; organizationName: string; shared: boolean; error?: string }[] = [];
      for (const id of targetIds) {
        const membership = membershipByOrg.get(id);
        const base = { organizationId: id, organizationName: membership?.organization.name ?? `Organization ${id}` };
        if (!membership) results.push({ ...base, shared: false, error: "You are not a member of this organization" });
        else if (!isAdminRole(membership.role)) results.push({ ...base, shared: false, error: "You need to be an admin of this organization" });
        else if (inGroup.has(id)) results.push({ ...base, shared: false, error: "Already shares this attendance" });
        else if (memberSet.has(id)) results.push({ ...base, shared: false, error: "Already uses another organization's attendance — it must stop that first" });
        else if (ownerSet.has(id)) results.push({ ...base, shared: false, error: "Already shares its own attendance with other organizations — stop that first" });
        else {
          await prisma.attendanceShare.create({ data: { ownerOrganizationId: rootId, memberOrganizationId: id, createdById: req.user!.id } });
          results.push({ ...base, shared: true });
        }
      }
      return res.status(200).json({ results });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /attendance/sharing/:organizationId — unlink an organization. The owner can remove any member; a member can only remove itself (leave). */
  static removeSharing = async (req: AuthRequest, res: Response) => {
    const memberId = parseInt(req.params.organizationId as string);
    if (!Number.isInteger(memberId)) return res.status(400).json({ message: "Invalid organization" });
    try {
      const currentId = req.organization!.id;
      const rootId = await dataOrganizationId(currentId);
      const link = await prisma.attendanceShare.findFirst({ where: { memberOrganizationId: memberId, ownerOrganizationId: rootId }, select: { id: true } });
      if (!link) return res.status(404).json({ message: "That organization isn't sharing this attendance" });
      if (memberId !== currentId && rootId !== currentId) {
        return res.status(403).json({ message: "Only the organization that owns the list can remove other organizations." });
      }
      await prisma.attendanceShare.delete({ where: { id: link.id } });
      return res.status(200).json({ message: "Sharing stopped" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------------------------

  /** POST /attendance/employees — body { name, position?, company? }. */
  static createEmployee = async (req: AuthRequest, res: Response) => {
    const name = cleanText(req.body?.name, 120);
    if (!name) return res.status(400).json({ message: "Employee name is required." });
    try {
      const employee = await prisma.attendanceEmployee.create({
        data: { organizationId: await dataOrganizationId(req.organization!.id), name, position: cleanText(req.body?.position, 120), company: cleanText(req.body?.company, 120) },
        select: { id: true, name: true, position: true, company: true },
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
      const organizationId = await dataOrganizationId(req.organization!.id);
      const existing = await prisma.attendanceEmployee.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!existing) return res.status(404).json({ message: "Employee not found" });
      const employee = await prisma.attendanceEmployee.update({
        where: { id },
        data: { name, position: cleanText(req.body?.position, 120), company: cleanText(req.body?.company, 120) },
        select: { id: true, name: true, position: true, company: true },
      });
      return res.status(200).json({ employee });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /attendance/employees/:id — removes the employee and all their attendance marks (for every organization sharing the list). */
  static deleteEmployee = async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid employee" });
    try {
      const organizationId = await dataOrganizationId(req.organization!.id);
      const existing = await prisma.attendanceEmployee.findFirst({ where: { id, organizationId }, select: { id: true } });
      if (!existing) return res.status(404).json({ message: "Employee not found" });
      await prisma.attendanceEmployee.delete({ where: { id } });
      return res.status(200).json({ message: "Employee removed" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Marks
  // ---------------------------------------------------------------------------------------------

  /** GET /attendance?date=YYYY-MM-DD — every employee with their status for that day (null = not taken yet). */
  static getDay = async (req: AuthRequest, res: Response) => {
    const day = parseDay(req.query.date);
    if (!day) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
    try {
      const organizationId = await dataOrganizationId(req.organization!.id);
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
      const organizationId = await dataOrganizationId(req.organization!.id);
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
      const organizationId = await dataOrganizationId(req.organization!.id);
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
