import { prisma } from "../config/prisma";

const MAX_LEAVE_DAYS = 366;

/**
 * When a leave request is approved, marks the matching attendance employee "On Leave" on every day of the leave
 * (start and end date inclusive, weekends too). Attendance employees are typed-in names rather than user accounts, so
 * the employee is found by name — equal to the requester's full name, ignoring capitals and surrounding spaces.
 * Attendance data lives under the organization's "data organization": its own, or the owner's when its attendance is
 * shared with another organization (see AttendanceShare). Existing marks for those days (e.g. Present) are replaced.
 * Returns the number of days marked (0 when no employee matches).
 */
export async function markApprovedLeaveOnAttendance(input: {
  organizationId: number;
  requesterName: string | null | undefined;
  startDate: Date;
  endDate: Date;
  markedById: number;
}): Promise<number> {
  const name = input.requesterName?.trim();
  if (!name) return 0;

  const link = await prisma.attendanceShare.findUnique({ where: { memberOrganizationId: input.organizationId }, select: { ownerOrganizationId: true } });
  const dataOrganizationId = link?.ownerOrganizationId ?? input.organizationId;

  const employees = await prisma.attendanceEmployee.findMany({
    where: { organizationId: dataOrganizationId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (employees.length === 0) return 0;

  // Calendar days from start to end (UTC midnight, matching how the attendance `date` column is stored).
  const first = new Date(`${input.startDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const last = new Date(`${input.endDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const days: Date[] = [];
  for (let d = first; d <= last && days.length < MAX_LEAVE_DAYS; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) days.push(d);

  const note = "Approved leave";
  const upserts = employees.flatMap((e) =>
    days.map((date) =>
      prisma.attendance.upsert({
        where: { organizationId_employeeId_date: { organizationId: dataOrganizationId, employeeId: e.id, date } },
        create: { organizationId: dataOrganizationId, employeeId: e.id, date, status: "on_leave", note, markedById: input.markedById },
        update: { status: "on_leave", note, markedById: input.markedById },
      }),
    ),
  );
  for (let i = 0; i < upserts.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop -- batches keep each transaction small
    await prisma.$transaction(upserts.slice(i, i + 200));
  }
  return days.length;
}
