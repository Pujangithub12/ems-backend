import { NextFunction, Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";

/**
 * Who can do what on the Attendance page (per organization):
 *  - edit   — a super admin, or anyone a super admin assigned (attendance_editor): take attendance, manage the
 *             employee list, share the list with other organizations.
 *  - view   — everyone who can edit, plus admins: they see the table and the monthly summary but cannot change it.
 *  - manage — super admins only: choose the people who can edit.
 * Anyone else (regular users, finance, ...) only gets the leave-request list.
 */
export type AttendancePermissions = { canView: boolean; canEdit: boolean; canManage: boolean };

export async function attendancePermissions(req: AuthRequest): Promise<AttendancePermissions> {
  const role = req.user!.role;
  const canManage = role === UserRole.SUPER_ADMIN;
  const assigned = canManage
    ? true
    : (await prisma.attendanceEditor.findUnique({
        where: { organizationId_userId: { organizationId: req.organization!.id, userId: req.user!.id } },
        select: { id: true },
      })) !== null;
  return { canView: assigned || role === UserRole.ADMIN, canEdit: assigned, canManage };
}

const guard = (allowed: (p: AttendancePermissions) => boolean, message: string) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!allowed(await attendancePermissions(req))) return res.status(403).json({ message });
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const requireAttendanceView = guard((p) => p.canView, "You don't have access to the attendance page.");
export const requireAttendanceEdit = guard((p) => p.canEdit, "You can only view attendance. Ask a super admin for edit access.");
export const requireAttendanceManage = guard((p) => p.canManage, "Only a super admin can manage attendance access.");
