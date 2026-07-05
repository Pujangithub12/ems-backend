import { Response } from "express";
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
      const isAdmin =
        req.user?.role === "admin" || req.user?.role === "super_admin";
      const userId = req.user?.id;
      const workspace = req.workspace!;

      if (isAdmin) {
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
        // Admins review every pending leave request in the workspace.
        const pendingLeaveRequests = await leaveRequestRepository.count({
          where: { status: "pending", workspace: { id: workspace.id } },
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

      // Regular users only see the status of their own leave requests.
      const pendingLeaveRequests = await leaveRequestRepository.count({
        where: {
          status: "pending",
          workspace: { id: workspace.id },
          user: { id: req.user!.id },
        },
      });

      const total = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.workspace.id = :workspaceId", {
          workspaceId: workspace.id,
        })
        .getCount();
      const pending = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.workspace.id = :workspaceId", {
          workspaceId: workspace.id,
        })
        .andWhere("task.status = :status", { status: TaskStatus.PENDING })
        .getCount();
      const inProgress = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.workspace.id = :workspaceId", {
          workspaceId: workspace.id,
        })
        .andWhere("task.status = :status", { status: TaskStatus.IN_PROGRESS })
        .getCount();
      const completed = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.workspace.id = :workspaceId", {
          workspaceId: workspace.id,
        })
        .andWhere("task.status = :status", { status: TaskStatus.COMPLETED })
        .getCount();
      const highPriorityTasks = await taskRepository
        .createQueryBuilder("task")
        .leftJoinAndSelect("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.workspace.id = :workspaceId", {
          workspaceId: workspace.id,
        })
        .andWhere("task.priority = :priority", { priority: TaskPriority.HIGH })
        .orderBy("task.createdAt", "DESC")
        .getMany();

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
