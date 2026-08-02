import { Response } from "express";
import { prisma } from "../config/prisma";
import { TaskPriority, TaskStatus } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import { toSimpleArray } from "../utils/simpleArray";

/** Aggregated stats for the main dashboard (task counts, high priority list, pending leave requests). */
export class DashboardController {
  static getDashboard = async (req: AuthRequest, res: Response) => {
    try {
      const isSuperAdmin = req.user?.role === "super_admin";
      const isAdminOrAbove =
        req.user?.role === "admin" || req.user?.role === "super_admin";
      const userId = req.user?.id;
      const organization = req.organization!;

      // Admins (and super admins) review every pending leave request in the
      // organization; regular users only see the status of their own.
      const pendingLeaveRequests = await prisma.leaveRequest.count({
        where: isAdminOrAbove
          ? { status: "pending", organizationId: organization.id }
          : {
              status: "pending",
              organizationId: organization.id,
              userId: req.user!.id,
            },
      });

      if (isSuperAdmin) {
        // Only the super admin sees stats across every task in the organization.
        const total = await prisma.task.count({
          where: { organizationId: organization.id },
        });
        const pending = await prisma.task.count({
          where: {
            status: TaskStatus.PENDING,
            organizationId: organization.id,
          },
        });
        const inProgress = await prisma.task.count({
          where: {
            status: TaskStatus.IN_PROGRESS,
            organizationId: organization.id,
          },
        });
        const completed = await prisma.task.count({
          where: {
            status: TaskStatus.COMPLETED,
            organizationId: organization.id,
          },
        });
        const highPriorityRows = await prisma.task.findMany({
          where: {
            priority: TaskPriority.HIGH,
            organizationId: organization.id,
          },
          include: { assignedUsers: { include: { user: true } } },
          orderBy: { createdAt: "desc" },
        });
        const highPriorityTasks = highPriorityRows.map((task) => ({
          ...task,
          files: toSimpleArray(task.files),
          assignedUsers: task.assignedUsers.map((a) => a.user),
        }));

        return res.status(200).json({
          total,
          pending,
          inProgress,
          completed,
          highPriorityTasks,
          pendingLeaveRequests,
        });
      }

      // Everyone else (including regular admins) only sees stats for tasks
      // they assigned (created) or were assigned to.
      const baseVisibleWhere = {
        organizationId: organization.id,
        OR: [{ assignedUsers: { some: { userId: userId! } } }, { createdById: userId! }],
      };

      const total = await prisma.task.count({ where: baseVisibleWhere });
      const pending = await prisma.task.count({
        where: { ...baseVisibleWhere, status: TaskStatus.PENDING },
      });
      const inProgress = await prisma.task.count({
        where: { ...baseVisibleWhere, status: TaskStatus.IN_PROGRESS },
      });
      const completed = await prisma.task.count({
        where: { ...baseVisibleWhere, status: TaskStatus.COMPLETED },
      });

      // Resolve visible high-priority task ids first, then re-fetch with full
      // relations — filtering directly on the joined "assignedUsers" alias
      // would silently truncate that relation to just the caller's own row.
      const highPriorityRowIds = await prisma.task.findMany({
        where: { ...baseVisibleWhere, priority: TaskPriority.HIGH },
        select: { id: true },
        distinct: ["id"],
      });
      const highPriorityTaskIds = highPriorityRowIds.map((row) => row.id);
      const highPriorityRows = highPriorityTaskIds.length
        ? await prisma.task.findMany({
            where: { id: { in: highPriorityTaskIds } },
            include: { assignedUsers: { include: { user: true } } },
            orderBy: { createdAt: "desc" },
          })
        : [];
      const highPriorityTasks = highPriorityRows.map((task) => ({
        ...task,
        assignedUsers: task.assignedUsers.map((a) => a.user),
      }));

      return res.status(200).json({
        total,
        pending,
        inProgress,
        completed,
        highPriorityTasks,
        pendingLeaveRequests,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
