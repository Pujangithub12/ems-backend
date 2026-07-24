import { Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { TaskPriority, TaskStatus } from "../entities/TaskEnums";
import { LeaveRequest } from "../entities/LeaveRequest";
import { AuthRequest } from "../middlewares/auth";

/** Aggregated stats for the main dashboard (task counts, high priority list, pending leave requests). */
export class DashboardController {
  static getDashboard = async (req: AuthRequest, res: Response) => {
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const leaveRequestRepository = AppDataSource.getRepository(LeaveRequest);
      const isSuperAdmin = req.user?.role === "super_admin";
      const isAdminOrAbove =
        req.user?.role === "admin" || req.user?.role === "super_admin";
      const userId = req.user?.id;
      const workspace = req.workspace!;

      // Admins (and super admins) review every pending leave request in the
      // workspace; regular users only see the status of their own.
      const pendingLeaveRequests = await leaveRequestRepository.count({
        where: isAdminOrAbove
          ? { status: "pending", workspace: { id: workspace.id } }
          : {
              status: "pending",
              workspace: { id: workspace.id },
              user: { id: req.user!.id },
            },
      });

      if (isSuperAdmin) {
        // Only the super admin sees stats across every task in the workspace.
        const total = await taskRepository.count({
          where: { workspace: { id: workspace.id } },
        });
        const pending = await taskRepository.count({
          where: {
            status: TaskStatus.PENDING,
            workspace: { id: workspace.id },
          },
        });
        const inProgress = await taskRepository.count({
          where: {
            status: TaskStatus.IN_PROGRESS,
            workspace: { id: workspace.id },
          },
        });
        const completed = await taskRepository.count({
          where: {
            status: TaskStatus.COMPLETED,
            workspace: { id: workspace.id },
          },
        });
        const highPriorityTasks = await taskRepository.find({
          where: {
            priority: TaskPriority.HIGH,
            workspace: { id: workspace.id },
          },
          relations: ["assignedUsers"],
          order: { createdAt: "DESC" },
        });

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
      const baseVisibleTasksQuery = () =>
        taskRepository
          .createQueryBuilder("task")
          .leftJoin("task.assignedUsers", "user")
          .leftJoin("task.createdBy", "createdByUser")
          .where("task.workspace.id = :workspaceId", {
            workspaceId: workspace.id,
          })
          .andWhere("(user.id = :userId OR createdByUser.id = :userId)", {
            userId,
          });

      const total = await baseVisibleTasksQuery().getCount();
      const pending = await baseVisibleTasksQuery()
        .andWhere("task.status = :status", { status: TaskStatus.PENDING })
        .getCount();
      const inProgress = await baseVisibleTasksQuery()
        .andWhere("task.status = :status", { status: TaskStatus.IN_PROGRESS })
        .getCount();
      const completed = await baseVisibleTasksQuery()
        .andWhere("task.status = :status", { status: TaskStatus.COMPLETED })
        .getCount();

      // Resolve visible high-priority task ids first, then re-fetch with full
      // relations — filtering directly on the joined "assignedUsers" alias
      // would silently truncate that relation to just the caller's own row.
      const highPriorityRows = await baseVisibleTasksQuery()
        .andWhere("task.priority = :priority", { priority: TaskPriority.HIGH })
        .select("task.id", "id")
        .distinct(true)
        .getRawMany();
      const highPriorityTaskIds = highPriorityRows.map((row) => row.id);
      const highPriorityTasks = highPriorityTaskIds.length
        ? await taskRepository.find({
            where: { id: In(highPriorityTaskIds) },
            relations: ["assignedUsers"],
            order: { createdAt: "DESC" },
          })
        : [];

      return res.status(200).json({
        total,
        pending,
        inProgress,
        completed,
        highPriorityTasks,
        pendingLeaveRequests,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
