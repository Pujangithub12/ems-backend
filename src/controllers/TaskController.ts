import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { TaskPriority, TaskStatus, UserRole } from "../entities/TaskEnums";
import { User } from "../entities/User";
import { WorkspaceMembership } from "../entities/WorkspaceMembership";
import { Project } from "../entities/Project";
import { SubTask } from "../entities/SubTask";
import { In } from "typeorm";
import { AuthRequest } from "../middlewares/auth";
import { ActivityController } from "./ActivityController";
import { ActivityType } from "../entities/Activity";
import { sendEmail } from "../utils/emailService";
import {
  buildSubTaskTree,
  computeAverageLeafProgress,
  fetchSubTasksForTask,
  saveSubTasks,
} from "../utils/subtaskTree";
import {
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskProgressDto,
  UpdateTaskStatusDto,
} from "../dto/task.dto";
import { getDescendantUserIds } from "../utils/hierarchyAuthority";

// Falls back by NODE_ENV (not just a single hardcoded default) so a missing
// FRONTEND_URL env var still points production task-assignment emails at the
// deployed frontend instead of localhost — same pattern as InviteController.
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://www.jdnenergy.com.np"
    : "http://localhost:5173");

const sanitizeCreatedBy = (task: Task) => {
  if (task.createdBy) {
    const { id, fullName, email } = task.createdBy;
    task.createdBy = { id, fullName, email } as User;
  }
};

export class TaskController {
  static createTask = async (req: AuthRequest, res: Response) => {
    const {
      title,
      description,
      priority,
      dueDate,
      userIds,
      assignAll,
      projectId,
      progress,
      subTasks,
      projectName,
    }: CreateTaskDto = req.body;

    const files = req.files as Express.Multer.File[];

    if (!title || !priority || !dueDate) {
      return res
        .status(400)
        .json({ message: "All fields except assignments are required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const taskRepository = AppDataSource.getRepository(Task);
      const projectRepository = AppDataSource.getRepository(Project);
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      let assignedUsers: User[] = [];
      let project: Project | null = null;

      let parsedUserIds: number[] = [];
      if (userIds) {
        if (Array.isArray(userIds)) {
          parsedUserIds = userIds.map((id) => parseInt(id.toString()));
        } else if (typeof userIds === "string") {
          parsedUserIds = userIds
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        }
      }

      const actorId = req.user!.id;
      const actorRole = req.user!.role;
      const workspaceId = req.workspace!.id;
      const isSuperAdmin = actorRole === UserRole.SUPER_ADMIN;

      if (assignAll === "true" || assignAll === true) {
        if (isSuperAdmin) {
          assignedUsers = (
            await AppDataSource.getRepository(WorkspaceMembership).find({
              where: { workspace: { id: workspaceId } },
              relations: ["user"],
            })
          ).map((m) => m.user);
        } else {
          // Non-root actors can only ever assign within their own reporting
          // line — "all" means "all of my descendants", not the workspace.
          const descendantIds = await getDescendantUserIds(workspaceId, actorId);
          const ids = Array.from(new Set([actorId, ...descendantIds]));
          assignedUsers = await userRepository.findBy({ id: In(ids) });
        }
      } else if (parsedUserIds.length > 0) {
        if (!isSuperAdmin) {
          const descendantIds = new Set(await getDescendantUserIds(workspaceId, actorId));
          const invalidIds = parsedUserIds.filter(
            (id) => id !== actorId && !descendantIds.has(id),
          );
          if (invalidIds.length > 0) {
            return res.status(403).json({
              message:
                "You can only assign a task to yourself or someone below you in the hierarchy",
            });
          }
        }
        assignedUsers = await userRepository.findBy({ id: In(parsedUserIds) });
      }

      if (projectId) {
        project = await projectRepository.findOneBy({
          id: parseInt(projectId as string),
        });
        if (!project)
          return res.status(404).json({ message: "Project not found" });
      }

      const filePaths = files ? files.map((file) => file.path) : [];

      const user = await userRepository.findOneBy({ id: req.user!.id });

      const taskPayload: Partial<Task> = {
        title,
        ...(description !== undefined ? { description } : {}),
        priority: priority as TaskPriority,
        status: TaskStatus.PENDING,
        dueDate: new Date(dueDate),
        assignedUsers,
        files: filePaths,
        progress: progress ? parseInt(progress as string) : 0,
        projectName: (projectName || null) as string,
        createdBy: user!,
        workspace: req.workspace!,
      };

      if (project) taskPayload.project = project;

      const newTask = taskRepository.create(taskPayload);
      await taskRepository.save(newTask);

      // Send email notifications to assigned users
      console.log(
        "[Task Create] Checking assigned users:",
        assignedUsers.length,
      );
      if (assignedUsers.length > 0) {
        const recipientEmails = assignedUsers
          .map((u) => u.email)
          .filter((email) => email);
        console.log("[Task Create] Recipient emails:", recipientEmails);
        console.log(
          "[Task Create] RESEND_API_KEY present?",
          !!process.env.RESEND_API_KEY,
        );
        console.log(
          "[Task Create] RESEND_FROM_EMAIL:",
          process.env.RESEND_FROM_EMAIL,
        );
        const assignedBy = user?.fullName || "EMS Administrator";
        const emailSubject = `New Task Assigned: ${title}`;
        const dashboardUrl = `${FRONTEND_URL}/${req.workspace!.id}/dashboard`;
        const priorityColors = {
          LOW: "#10b981",
          MEDIUM: "#f59e0b",
          HIGH: "#ef4444",
          URGENT: "#dc2626",
        };
        const priorityColor =
          priorityColors[priority as keyof typeof priorityColors] || "#6366f1";
        const emailText = `
Hello,

You have been assigned a new task!

Assigned By: ${assignedBy}
Task Details:
- Title: ${title}
- Priority: ${priority}
- Due Date: ${new Date(dueDate).toLocaleDateString()}
${description ? `- Description: ${description}` : ""}
${projectName ? `- Project: ${projectName}` : ""}

Please log in to view and complete the task.

Best regards,
EMS Management
        `.trim();

        const emailHtml = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Task Assigned</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; padding: 40px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 32px 40px;">
                        <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0;">New Task Assigned</h1>
                        <p style="color: #c7d2fe; font-size: 14px; margin: 8px 0 0 0;">You have a new task waiting for you!</p>
                      </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <!-- Assigned By -->
                        <table role="presentation" style="width: 100%; margin-bottom: 24px;">
                          <tr>
                            <td style="vertical-align: top; width: 48px;">
                              <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 18px; font-weight: 700;">
                                ${assignedBy.charAt(0).toUpperCase()}
                              </div>
                            </td>
                            <td style="padding-left: 16px;">
                              <p style="color: #64748b; font-size: 13px; margin: 0 0 4px 0;">Assigned By</p>
                              <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0;">${assignedBy}</p>
                            </td>
                          </tr>
                        </table>

                        <!-- Task Details Card -->
                        <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 24px;">
                          <tr>
                            <td style="padding-bottom: 16px;">
                              <p style="color: #64748b; font-size: 13px; margin: 0 0 4px 0;">Task Title</p>
                              <p style="color: #1e293b; font-size: 18px; font-weight: 700; margin: 0;">${title}</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0; border-top: 1px solid #e2e8f0;">
                              <table role="presentation" style="width: 100%;">
                                <tr>
                                  <td style="width: 50%; padding-right: 12px;">
                                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Priority</p>
                                    <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; color: #ffffff; background-color: ${priorityColor};">
                                      ${priority}
                                    </span>
                                  </td>
                                  <td style="width: 50%; padding-left: 12px;">
                                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Due Date</p>
                                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0;">${new Date(dueDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          ${
                            description
                              ? `
                          <tr>
                            <td style="padding-top: 12px; border-top: 1px solid #e2e8f0;">
                              <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Description</p>
                              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">${description}</p>
                            </td>
                          </tr>
                          `
                              : ""
                          }
                          ${
                            projectName
                              ? `
                          <tr>
                            <td style="padding-top: 12px; border-top: 1px solid #e2e8f0;">
                              <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project</p>
                              <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0;">${projectName}</p>
                            </td>
                          </tr>
                          `
                              : ""
                          }
                        </table>

                        <!-- CTA Button -->
                        <table role="presentation" style="width: 100%; margin-bottom: 24px;">
                          <tr>
                            <td align="center">
                              <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
                                View Task in Dashboard
                              </a>
                            </td>
                          </tr>
                        </table>

                        <!-- Footer Text -->
                        <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0;">
                          Please log in to your EMS account to view and complete the task. If you have any questions, contact your administrator.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f1f5f9; padding: 24px 40px;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                          © ${new Date().getFullYear()} EMS Management. All rights reserved.<br>
                          This email was sent automatically. Please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;

        console.log("[Task Create] Calling sendEmail...");
        sendEmail(recipientEmails, emailSubject, emailText, emailHtml, "task-assignment")
          .then((success) => {
            console.log("[Task Create] sendEmail returned success:", success);
          })
          .catch((err) => {
            console.error(
              "[Task Create] Failed to send task assignment emails:",
              err,
            );
          });
      } else {
        console.log("[Task Create] No assigned users, skipping emails");
      }

      // Handle subTasks (supports nested)
      if (subTasks) {
        const parsedSubTasks =
          typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
        if (Array.isArray(parsedSubTasks)) {
          await saveSubTasks(parsedSubTasks, newTask, subTaskRepository);
        }
      }

      // Fetch all subtasks to return the complete tree with real DB IDs
      const allSubTasks = await fetchSubTasksForTask(newTask.id);
      newTask.subTasks = buildSubTaskTree(allSubTasks);
      if (newTask.subTasks.length > 0) {
        const avg = computeAverageLeafProgress(newTask.subTasks);
        newTask.progress = avg;
        await taskRepository.update(newTask.id, { progress: avg });
      }

      // Log activity for task creation
      await ActivityController.logActivity(
        ActivityType.TASK_CREATED,
        `Created task "${newTask.title}"`,
        newTask.id,
        req.user?.id,
        req.workspace,
      );

      if (assignedUsers.length > 0) {
        const assignedNames = assignedUsers.map((u) => u.fullName).join(", ");
        await ActivityController.logActivity(
          ActivityType.TASK_ASSIGNED,
          `Assigned task "${newTask.title}" to ${assignedNames}`,
          newTask.id,
          req.user?.id,
          req.workspace,
        );
      }

      sanitizeCreatedBy(newTask);

      return res.status(201).json({
        message: "Task created and assigned successfully",
        task: newTask,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getAllTasks = async (req: AuthRequest, res: Response) => {
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const workspace = req.workspace!;
      let tasks;

      if (req.user?.role === UserRole.SUPER_ADMIN) {
        // Super admin sees every task in the workspace.
        tasks = await taskRepository.find({
          relations: ["assignedUsers", "project", "comments", "createdBy"],
          where: { workspace: { id: workspace.id } },
          order: { createdAt: "DESC" },
        });
      } else {
        // Everyone else (including regular admins) only sees a task if they
        // assigned it (created it) or were assigned to it. Resolve matching
        // task ids via a query-builder join first, then re-fetch with full
        // relations — filtering directly on the joined "assignedUsers" alias
        // would silently truncate that relation to just the caller's own row.
        const visibleRows = await taskRepository
          .createQueryBuilder("task")
          .leftJoin("task.assignedUsers", "user")
          .leftJoin("task.createdBy", "createdByUser")
          .where("task.workspace.id = :workspaceId", {
            workspaceId: workspace.id,
          })
          .andWhere("(user.id = :userId OR createdByUser.id = :userId)", {
            userId: req.user?.id,
          })
          .select("task.id", "id")
          .distinct(true)
          .getRawMany();

        const taskIds = visibleRows.map((row) => row.id);
        tasks = taskIds.length
          ? await taskRepository.find({
              relations: ["assignedUsers", "project", "comments", "createdBy"],
              where: { id: In(taskIds) },
              order: { createdAt: "DESC" },
            })
          : [];
      }

      tasks.forEach((t) => sanitizeCreatedBy(t));

      if (tasks.length > 0) {
        const taskIds = tasks.map((t) => t.id);

        const allSubTasks = await subTaskRepository
          .createQueryBuilder("subTask")
          .leftJoinAndSelect("subTask.parent", "parent")
          .leftJoinAndSelect("subTask.task", "task")
          .addSelect("subTask.progress")
          .addSelect("subTask.history")
          .where("task.id IN (:...taskIds)", { taskIds })
          .getMany();

        const subTasksByTask = new Map<number, any[]>();
        allSubTasks.forEach((st) => {
          const taskId = typeof st.task === "object" ? st.task.id : st.task;
          if (!subTasksByTask.has(taskId)) subTasksByTask.set(taskId, []);
          subTasksByTask.get(taskId)!.push(st);
        });

        tasks.forEach((task) => {
          task.subTasks = buildSubTaskTree(subTasksByTask.get(task.id) || []);
          task.progress = computeAverageLeafProgress(task.subTasks);
        });
      }

      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTaskProgress = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { progress }: UpdateTaskProgressDto = req.body;

    if (progress === undefined || progress === null) {
      return res.status(400).json({ message: "Progress is required" });
    }

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((user) => user.id === userId);

      if (
        !isAssigned &&
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        return res
          .status(403)
          .json({ message: "Forbidden: You are not assigned to this task." });
      }

      task.progress = parseInt(progress as string);
      await taskRepository.save(task);

      return res
        .status(200)
        .json({ message: "Task progress updated successfully", task });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTaskById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: [
          "assignedUsers",
          "project",
          "comments",
          "comments.author",
          "createdBy",
        ],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (req.user?.role !== UserRole.SUPER_ADMIN) {
        // Only the assigner (creator) and the assignees may view a task.
        const assignedToUser = task.assignedUsers.some(
          (user) => user.id === req.user?.id,
        );
        const isCreator = task.createdBy?.id === req.user?.id;
        if (!assignedToUser && !isCreator)
          return res.status(403).json({ message: "Forbidden" });
      }

      const allSubTasks = await fetchSubTasksForTask(task.id);
      task.subTasks = buildSubTaskTree(allSubTasks);
      task.progress = computeAverageLeafProgress(task.subTasks);
      sanitizeCreatedBy(task);

      return res.status(200).json(task);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTask = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      title,
      description,
      priority,
      dueDate,
      status,
      userIds,
      assignAll,
      projectId,
      progress,
      subTasks,
      projectName,
    }: UpdateTaskDto = req.body;

    const files = req.files as Express.Multer.File[];

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const userRepository = AppDataSource.getRepository(User);
      const projectRepository = AppDataSource.getRepository(Project);
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers", "project"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (title) task.title = title;
      if (description !== undefined) task.description = description;
      if (priority) task.priority = priority as TaskPriority;
      if (status && Object.values(TaskStatus).includes(status as TaskStatus))
        task.status = status as TaskStatus;
      if (dueDate) task.dueDate = new Date(dueDate);
      if (progress !== undefined) task.progress = parseInt(progress as string);
      if (projectName !== undefined) task.projectName = projectName;

      if (projectId) {
        const project = await projectRepository.findOneBy({
          id: parseInt(projectId as string),
        });
        if (!project)
          return res.status(404).json({ message: "Project not found" });
        task.project = project;
      }

      let parsedUserIds: number[] = [];
      if (userIds !== undefined && userIds !== null) {
        if (Array.isArray(userIds)) {
          parsedUserIds = userIds.map((id) => parseInt(id.toString()));
        } else if (typeof userIds === "string") {
          parsedUserIds = userIds
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        }
      }

      const actorId = req.user!.id;
      const actorRole = req.user!.role;
      const workspaceId = req.workspace!.id;
      const isSuperAdmin = actorRole === UserRole.SUPER_ADMIN;

      let newAssignedUsers: User[] = [...task.assignedUsers];
      if (assignAll === "true" || assignAll === true) {
        if (isSuperAdmin) {
          newAssignedUsers = (
            await AppDataSource.getRepository(WorkspaceMembership).find({
              where: { workspace: { id: workspaceId } },
              relations: ["user"],
            })
          ).map((m) => m.user);
        } else {
          const descendantIds = await getDescendantUserIds(workspaceId, actorId);
          const ids = Array.from(new Set([actorId, ...descendantIds]));
          newAssignedUsers = await userRepository.findBy({ id: In(ids) });
        }
        task.assignedUsers = newAssignedUsers;
      } else if (userIds !== undefined && userIds !== null) {
        if (!isSuperAdmin && parsedUserIds.length > 0) {
          const descendantIds = new Set(await getDescendantUserIds(workspaceId, actorId));
          const invalidIds = parsedUserIds.filter(
            (uid) => uid !== actorId && !descendantIds.has(uid),
          );
          if (invalidIds.length > 0) {
            return res.status(403).json({
              message:
                "You can only assign a task to yourself or someone below you in the hierarchy",
            });
          }
        }
        // Explicitly provided (possibly empty) — replace assignees, including clearing to none.
        newAssignedUsers =
          parsedUserIds.length > 0
            ? await userRepository.findBy({ id: In(parsedUserIds) })
            : [];
        task.assignedUsers = newAssignedUsers;
      }

      if (files && files.length > 0) {
        const newFilePaths = files.map((file) => file.path);
        task.files = [...(task.files || []), ...newFilePaths];
      }

      // Handle subTasks (supports nested) — UPDATE existing ones to preserve history/progress
      if (subTasks) {
        const parsedSubTasks =
          typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
        if (Array.isArray(parsedSubTasks)) {
          // 1. Fetch all existing subtasks for this task
          const existingSubTasks = await fetchSubTasksForTask(task.id);
          const existingSubTasksMap = new Map<string, SubTask>();
          existingSubTasks.forEach((st) =>
            existingSubTasksMap.set(String(st.id), st),
          );

          // 2. Helper to update or create subtasks recursively
          const updateOrCreateSubTasks = async (
            subTasksList: any[],
            parentSubTask?: SubTask,
          ): Promise<void> => {
            for (const subTaskData of subTasksList) {
              if (!subTaskData.title) continue;

              const subTaskIdStr = String(subTaskData.id);
              let subTask: SubTask;

              if (
                existingSubTasksMap.has(subTaskIdStr) &&
                !subTaskIdStr.startsWith("temp-")
              ) {
                // Update existing subtask (preserve history, progress!)
                subTask = existingSubTasksMap.get(subTaskIdStr)!;
                subTask.title = subTaskData.title;
                if (parentSubTask) subTask.parent = parentSubTask;
                await subTaskRepository.save(subTask);
                existingSubTasksMap.delete(subTaskIdStr); // Mark as processed
              } else {
                // Create new subtask
                subTask = subTaskRepository.create({
                  title: subTaskData.title,
                  task,
                  ...(parentSubTask ? { parent: parentSubTask } : {}),
                });
                await subTaskRepository.save(subTask);
              }

              // Process children
              if (
                Array.isArray(subTaskData.subTasks) &&
                subTaskData.subTasks.length > 0
              ) {
                await updateOrCreateSubTasks(subTaskData.subTasks, subTask);
              }
            }
          };

          // 3. Process the parsed subtasks
          await updateOrCreateSubTasks(parsedSubTasks);

          // 4. Delete remaining (unprocessed) existing subtasks
          const subtasksToDelete = Array.from(existingSubTasksMap.values());
          // Delete leaf nodes first
          const deleteLeafNodes = async (toDelete: SubTask[]) => {
            if (toDelete.length === 0) return;
            const leafNodes = toDelete.filter((st) => {
              const hasChildren = toDelete.some(
                (other) => other.parent?.id === st.id,
              );
              return !hasChildren;
            });
            if (leafNodes.length > 0) {
              await subTaskRepository.remove(leafNodes);
              await deleteLeafNodes(
                toDelete.filter((st) => !leafNodes.includes(st)),
              );
            }
          };
          await deleteLeafNodes(subtasksToDelete);
        }
      }

      await taskRepository.save(task);

      // 4. Refetch task WITHOUT subTasks relations (we will build it manually)
      const updatedTask = await taskRepository.findOne({
        where: { id: task.id },
        relations: [
          "assignedUsers",
          "project",
          "comments",
          "comments.author",
          "createdBy",
        ],
      });

      // 5. Fetch ALL subtasks and build the complete tree
      const allSubTasks = await fetchSubTasksForTask(task.id);

      if (updatedTask) {
        updatedTask.subTasks = buildSubTaskTree(allSubTasks);
        updatedTask.progress = computeAverageLeafProgress(updatedTask.subTasks);
        await taskRepository.update(task.id, {
          progress: updatedTask.progress,
        });
        sanitizeCreatedBy(updatedTask);
      }

      // Log activity if assigned users changed
      if (
        (assignAll !== undefined && assignAll !== null) ||
        (userIds && parsedUserIds.length > 0)
      ) {
        const assignedNames = newAssignedUsers
          .map((u) => u.fullName)
          .join(", ");
        await ActivityController.logActivity(
          ActivityType.TASK_ASSIGNED,
          `Assigned task "${task.title}" to ${assignedNames}`,
          task.id,
          req.user?.id,
          req.workspace,
        );
      }

      return res
        .status(200)
        .json({ message: "Task updated successfully", task: updatedTask });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTaskStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status }: UpdateTaskStatusDto = req.body;

    if (!status) return res.status(400).json({ message: "Status is required" });

    const normalized = String(status).toLowerCase().replace(/\s+/g, "_");
    if (!Object.values(TaskStatus).includes(normalized as TaskStatus)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((user) => user.id === userId);
      if (
        !isAssigned &&
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      )
        return res.status(403).json({ message: "Forbidden" });

      task.status = normalized as TaskStatus;
      await taskRepository.save(task);

      return res.status(200).json({ message: "Task status updated", task });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTasksByProject = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const projectIdInt = parseInt(projectId as string);
      const projectTasks = await taskRepository.find({
        where: { project: { id: projectIdInt } },
        relations: ["assignedUsers", "project", "comments", "createdBy"],
        order: { createdAt: "DESC" },
      });

      let tasksToReturn = projectTasks;
      if (req.user?.role !== UserRole.SUPER_ADMIN) {
        // Only the assigner (creator) and the assignees may view a task.
        tasksToReturn = projectTasks.filter(
          (task) =>
            task.assignedUsers.some((user) => user.id === req.user?.id) ||
            task.createdBy?.id === req.user?.id,
        );
      }

      tasksToReturn.forEach((t) => sanitizeCreatedBy(t));

      if (tasksToReturn.length > 0) {
        const taskIds = tasksToReturn.map((t) => t.id);

        const allSubTasks = await subTaskRepository
          .createQueryBuilder("subTask")
          .leftJoinAndSelect("subTask.parent", "parent")
          .leftJoinAndSelect("subTask.task", "task")
          .addSelect("subTask.progress")
          .addSelect("subTask.history")
          .where("task.id IN (:...taskIds)", { taskIds })
          .getMany();

        const subTasksByTask = new Map<number, any[]>();
        allSubTasks.forEach((st) => {
          const taskId = typeof st.task === "object" ? st.task.id : st.task;
          if (!subTasksByTask.has(taskId)) subTasksByTask.set(taskId, []);
          subTasksByTask.get(taskId)!.push(st);
        });

        tasksToReturn.forEach((task) => {
          task.subTasks = buildSubTaskTree(subTasksByTask.get(task.id) || []);
        });
      }

      return res.status(200).json(tasksToReturn);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      await taskRepository.remove(task);
      return res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
