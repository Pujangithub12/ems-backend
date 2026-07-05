"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const data_source_1 = require("../config/data-source");
const Task_1 = require("../entities/Task");
const TaskEnums_1 = require("../entities/TaskEnums");
const LeaveRequest_1 = require("../entities/LeaveRequest");
/** Aggregated stats for the main dashboard (task counts, high priority list, pending leave requests). */
class DashboardController {
    static getDashboard = async (req, res) => {
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const leaveRequestRepository = data_source_1.AppDataSource.getRepository(LeaveRequest_1.LeaveRequest);
            const isAdmin = req.user?.role === "admin" || req.user?.role === "super_admin";
            const userId = req.user?.id;
            const workspace = req.workspace;
            if (isAdmin) {
                const total = await taskRepository.count({
                    where: { workspace: { id: workspace.id } },
                });
                const pending = await taskRepository.count({
                    where: {
                        status: TaskEnums_1.TaskStatus.PENDING,
                        workspace: { id: workspace.id },
                    },
                });
                const inProgress = await taskRepository.count({
                    where: {
                        status: TaskEnums_1.TaskStatus.IN_PROGRESS,
                        workspace: { id: workspace.id },
                    },
                });
                const completed = await taskRepository.count({
                    where: {
                        status: TaskEnums_1.TaskStatus.COMPLETED,
                        workspace: { id: workspace.id },
                    },
                });
                const highPriorityTasks = await taskRepository.find({
                    where: {
                        priority: TaskEnums_1.TaskPriority.HIGH,
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
                    user: { id: req.user.id },
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
                .andWhere("task.status = :status", { status: TaskEnums_1.TaskStatus.PENDING })
                .getCount();
            const inProgress = await taskRepository
                .createQueryBuilder("task")
                .leftJoin("task.assignedUsers", "user")
                .where("user.id = :userId", { userId })
                .andWhere("task.workspace.id = :workspaceId", {
                workspaceId: workspace.id,
            })
                .andWhere("task.status = :status", { status: TaskEnums_1.TaskStatus.IN_PROGRESS })
                .getCount();
            const completed = await taskRepository
                .createQueryBuilder("task")
                .leftJoin("task.assignedUsers", "user")
                .where("user.id = :userId", { userId })
                .andWhere("task.workspace.id = :workspaceId", {
                workspaceId: workspace.id,
            })
                .andWhere("task.status = :status", { status: TaskEnums_1.TaskStatus.COMPLETED })
                .getCount();
            const highPriorityTasks = await taskRepository
                .createQueryBuilder("task")
                .leftJoinAndSelect("task.assignedUsers", "user")
                .where("user.id = :userId", { userId })
                .andWhere("task.workspace.id = :workspaceId", {
                workspaceId: workspace.id,
            })
                .andWhere("task.priority = :priority", { priority: TaskEnums_1.TaskPriority.HIGH })
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.DashboardController = DashboardController;
//# sourceMappingURL=DashboardController.js.map