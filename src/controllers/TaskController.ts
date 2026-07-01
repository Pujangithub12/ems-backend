import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { TaskPriority, TaskStatus, UserRole } from "../entities/TaskEnums";
import { User } from "../entities/User";
import { Project } from "../entities/Project";
import { SubTask } from "../entities/SubTask";
import { TaskComment } from "../entities/TaskComment";
import { SubTaskComment } from "../entities/SubTaskComment";
import { In } from "typeorm";
import { AuthRequest } from "../middlewares/auth";
import { ActivityController } from "./ActivityController";
import { ActivityType } from "../entities/Activity";
import { sendEmail } from "../utils/emailService";

// Helper to build subtask tree from flat list (Bypasses TypeORM relation depth limits)
const buildSubTaskTree = (subTasks: any[]): any[] => {
  const map = new Map<string, any>();
  const roots: any[] = [];

  subTasks.forEach((st) => {
    // Explicitly map fields to ensure progress and history are never dropped
    map.set(String(st.id), {
      id: st.id,
      title: st.title,
      status: st.status,
      progress: st.progress ?? 0,
      history: st.history ?? [],
      parent: st.parent,
      createdAt: st.createdAt,
      children: [],
    });
  });

  subTasks.forEach((st) => {
    const node = map.get(String(st.id));
    let parentId = null;

    if (st.parentId !== undefined && st.parentId !== null) {
      parentId = String(st.parentId);
    } else if (st.parent) {
      const pId = typeof st.parent === "object" ? st.parent.id : st.parent;
      if (pId !== null && pId !== undefined) parentId = String(pId);
    }

    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(node);
    } else if (!parentId) {
      roots.push(node);
    }
  });

  return roots;
};

// Helper to consistently fetch all subtasks for a task with all required fields
const fetchSubTasksForTask = async (taskId: number) => {
  const subTaskRepository = AppDataSource.getRepository(SubTask);

  return await subTaskRepository.find({
    where: { task: { id: taskId } },
    relations: ["parent"],
    order: { createdAt: "ASC" },
  });
};

const computeAverageLeafProgress = (tree: any[]): number => {
  let sum = 0;
  let count = 0;

  const visit = (nodes: any[]) => {
    for (const n of nodes || []) {
      const children = n.children || [];
      if (children.length > 0) {
        visit(children);
      } else {
        const v =
          typeof n.progress === "number"
            ? n.progress
            : parseInt(n.progress ?? "0");
        const clamped = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
        sum += clamped;
        count += 1;
      }
    }
  };

  visit(tree || []);
  return count === 0 ? 0 : Math.round(sum / count);
};

// Helper to recursively save subtasks with optional parent
const saveSubTasks = async (
  parsedSubTasks: any[],
  parentTask: Task,
  subTaskRepository: any,
  parentSubTask?: SubTask,
): Promise<void> => {
  for (const subTaskData of parsedSubTasks) {
    if (!subTaskData.title) continue;
    const subTask = subTaskRepository.create({
      title: subTaskData.title,
      task: parentTask,
      ...(parentSubTask ? { parent: parentSubTask } : {}),
    });
    await subTaskRepository.save(subTask);
    if (
      Array.isArray(subTaskData.subTasks) &&
      subTaskData.subTasks.length > 0
    ) {
      await saveSubTasks(
        subTaskData.subTasks,
        parentTask,
        subTaskRepository,
        subTask,
      );
    }
  }
};

export class TaskController {
  static createTask = async (req: AuthRequest, res: Response) => {
    const {
      companyName,
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
    } = req.body;

    const files = req.files as Express.Multer.File[];

    if (!companyName || !title || !priority || !dueDate) {
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

      if (assignAll === "true" || assignAll === true) {
        assignedUsers = await userRepository.find();
      } else if (parsedUserIds.length > 0) {
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
        companyName,
        title,
        description,
        priority: priority as TaskPriority,
        status: TaskStatus.PENDING,
        dueDate: new Date(dueDate),
        assignedUsers,
        files: filePaths,
        progress: progress ? parseInt(progress) : 0,
        projectName: projectName || null,
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
                              <a href="#" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
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
        sendEmail(recipientEmails, emailSubject, emailText, emailHtml)
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
      );

      if (assignedUsers.length > 0) {
        const assignedNames = assignedUsers.map((u) => u.fullName).join(", ");
        await ActivityController.logActivity(
          ActivityType.TASK_ASSIGNED,
          `Assigned task "${newTask.title}" to ${assignedNames}`,
          newTask.id,
          req.user?.id,
        );
      }

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
        // Super admin can see all tasks in current workspace
        tasks = await taskRepository.find({
          relations: ["assignedUsers", "project", "comments"],
          where: { workspace: { id: workspace.id } },
          order: { createdAt: "DESC" },
        });
      } else if (req.user?.role === UserRole.ADMIN) {
        // Regular admin only sees tasks they created in current workspace
        tasks = await taskRepository.find({
          relations: ["assignedUsers", "project", "comments"],
          where: {
            createdBy: { id: req.user?.id },
            workspace: { id: workspace.id },
          },
          order: { createdAt: "DESC" },
        });
      } else {
        // Regular user sees tasks assigned to them in current workspace
        tasks = await taskRepository
          .createQueryBuilder("task")
          .leftJoinAndSelect("task.assignedUsers", "user")
          .leftJoinAndSelect("task.project", "project")
          .leftJoinAndSelect("task.comments", "comment")
          .where("user.id = :userId", { userId: req.user?.id })
          .andWhere("task.workspace.id = :workspaceId", {
            workspaceId: workspace.id,
          })
          .orderBy("task.createdAt", "DESC")
          .getMany();
      }

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
    const { progress } = req.body;

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

      task.progress = parseInt(progress);
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
        relations: ["assignedUsers", "project", "comments", "comments.author"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        const assignedToUser = task.assignedUsers.some(
          (user) => user.id === req.user?.id,
        );
        if (!assignedToUser)
          return res.status(403).json({ message: "Forbidden" });
      }

      const allSubTasks = await fetchSubTasksForTask(task.id);
      task.subTasks = buildSubTaskTree(allSubTasks);
      task.progress = computeAverageLeafProgress(task.subTasks);

      return res.status(200).json(task);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTask = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      companyName,
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
    } = req.body;

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

      const oldStatus = task.status;

      if (companyName) task.companyName = companyName;
      if (title) task.title = title;
      if (description !== undefined) task.description = description;
      if (priority) task.priority = priority as TaskPriority;
      if (status && Object.values(TaskStatus).includes(status as TaskStatus))
        task.status = status as TaskStatus;
      if (dueDate) task.dueDate = new Date(dueDate);
      if (progress !== undefined) task.progress = parseInt(progress);
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

      let newAssignedUsers: User[] = [...task.assignedUsers];
      if (assignAll === "true" || assignAll === true) {
        newAssignedUsers = await userRepository.find();
        task.assignedUsers = newAssignedUsers;
      } else if (parsedUserIds.length > 0) {
        newAssignedUsers = await userRepository.findBy({
          id: In(parsedUserIds),
        });
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
        relations: ["assignedUsers", "project", "comments", "comments.author"],
      });

      // 5. Fetch ALL subtasks and build the complete tree
      const allSubTasks = await fetchSubTasksForTask(task.id);

      if (updatedTask) {
        updatedTask.subTasks = buildSubTaskTree(allSubTasks);
        updatedTask.progress = computeAverageLeafProgress(updatedTask.subTasks);
        await taskRepository.update(task.id, {
          progress: updatedTask.progress,
        });
      }

      // Log activity if status changed
      if (status && status !== oldStatus) {
        const statusLabel = (status as string).replace(/_/g, " ");
        await ActivityController.logActivity(
          ActivityType.STATUS_CHANGED,
          `Changed status of "${task.title}" to ${statusLabel}`,
          task.id,
          req.user?.id,
        );
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
    const { status } = req.body;

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

      const statusLabel = normalized.replace(/_/g, " ");
      await ActivityController.logActivity(
        ActivityType.STATUS_CHANGED,
        `Changed status of "${task.title}" to ${statusLabel}`,
        task.id,
        userId,
      );

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
        relations: ["assignedUsers", "project", "comments"],
        order: { createdAt: "DESC" },
      });

      let tasksToReturn = projectTasks;
      if (
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        tasksToReturn = projectTasks.filter((task) =>
          task.assignedUsers.some((user) => user.id === req.user?.id),
        );
      }

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

  static addSubTask = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    const { title, parentSubTaskId } = req.body;

    if (!title)
      return res.status(400).json({ message: "Subtask title is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
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

      const subTaskPayload: Partial<SubTask> = { title, task };

      if (parentSubTaskId) {
        const parentSubTask = await subTaskRepository.findOneBy({
          id: parseInt(parentSubTaskId as string),
        });
        if (!parentSubTask)
          return res.status(404).json({ message: "Parent subtask not found" });
        subTaskPayload.parent = parentSubTask;
      }

      const subTask = subTaskRepository.create(subTaskPayload);
      await subTaskRepository.save(subTask);

      const allSubTasks = await fetchSubTasksForTask(task.id);
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      await taskRepository.update(task.id, { progress: avg });

      return res.status(201).json({
        message: "Subtask added",
        subTask,
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      console.error("Add SubTask Error:", error);
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateSubTask = async (req: AuthRequest, res: Response) => {
    const { taskId, subtaskId } = req.params;
    const { title: updateText, status, progress } = req.body;

    console.log("=== updateSubTask called ===", {
      taskId,
      subtaskId,
      updateText,
      progress,
    });

    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const userRepository = AppDataSource.getRepository(User);
      const subTaskCommentRepository =
        AppDataSource.getRepository(SubTaskComment);
      const subTask = await subTaskRepository.findOne({
        where: { id: parseInt(subtaskId as string) },
        relations: ["task"],
      });

      if (!subTask || subTask.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) return res.status(404).json({ message: "User not found" });

      // Capture old progress for history
      const oldProgress = subTask.progress ?? 0;

      // Only update status and progress, NOT the original title
      if (status && Object.values(TaskStatus).includes(status as TaskStatus)) {
        subTask.status = status as TaskStatus;
      }
      if (progress !== undefined) {
        subTask.progress = parseInt(progress);
      }

      // Add current state to history with the update text
      const history = subTask.history || [];
      history.unshift({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        title: updateText || `Progress updated to ${progress}%`,
        progress: parseInt(progress) || oldProgress,
        authorId: user.id,
        authorName: user.fullName,
      });

      // Keep only the last 10 updates to prevent database bloat
      subTask.history = history.slice(0, 10);

      // Save the subtask
      await subTaskRepository.save(subTask);

      // Create a SubTaskComment for this update so admin can give feedback
      if (updateText) {
        const newComment = subTaskCommentRepository.create({
          commentText: updateText,
          author: user,
          subTask: subTask,
        });
        await subTaskCommentRepository.save(newComment);
      }

      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      const taskRepository = AppDataSource.getRepository(Task);
      await taskRepository.update(parseInt(taskId as string), {
        progress: avg,
      });

      return res.status(200).json({
        message: "Subtask updated",
        subTask,
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteSubTask = async (req: Request, res: Response) => {
    const { taskId, subtaskId } = req.params;
    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const subTask = await subTaskRepository.findOne({
        where: { id: parseInt(subtaskId as string) },
        relations: ["task"],
      });

      if (!subTask || subTask.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      await subTaskRepository.remove(subTask);

      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      const tree = buildSubTaskTree(allSubTasks);
      const avg = computeAverageLeafProgress(tree);
      const taskRepository = AppDataSource.getRepository(Task);
      await taskRepository.update(parseInt(taskId as string), {
        progress: avg,
      });

      return res.status(200).json({
        message: "Subtask deleted successfully",
        subTasks: tree,
        taskProgress: avg,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getSubTasks = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    try {
      const allSubTasks = await fetchSubTasksForTask(
        parseInt(taskId as string),
      );
      console.log(
        "Raw subtasks from DB:",
        JSON.stringify(
          allSubTasks.map((st) => ({
            id: st.id,
            history: st.history,
            progress: st.progress,
          })),
        ),
      );
      const tree = buildSubTaskTree(allSubTasks);
      return res.status(200).json(tree);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addComment = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    const { commentText } = req.body;

    if (!commentText)
      return res.status(400).json({ message: "Comment text is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const commentRepository = AppDataSource.getRepository(TaskComment);
      const userRepository = AppDataSource.getRepository(User);
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) return res.status(404).json({ message: "User not found" });

      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.id === user.id,
      );
      if (
        !isAssigned &&
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      )
        return res.status(403).json({ message: "Forbidden" });

      const comment = commentRepository.create({
        commentText,
        author: user,
        task,
      });
      await commentRepository.save(comment);

      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTaskComments = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        const isAssigned = task.assignedUsers.some(
          (assigned) => assigned.id === req.user?.id,
        );
        if (!isAssigned) return res.status(403).json({ message: "Forbidden" });
      }

      const commentRepository = AppDataSource.getRepository(TaskComment);
      const comments = await commentRepository.find({
        where: { task: { id: task.id } },
        relations: ["author"],
        order: { createdAt: "ASC" },
      });

      return res.status(200).json(comments);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addFeedback = async (req: Request, res: Response) => {
    const { taskId, commentId } = req.params;
    const { feedback } = req.body;

    if (!feedback)
      return res.status(400).json({ message: "Feedback is required" });

    try {
      const commentRepository = AppDataSource.getRepository(TaskComment);
      const comment = await commentRepository.findOne({
        where: { id: parseInt(commentId as string) },
        relations: ["task"],
      });

      if (!comment || comment.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Comment not found" });
      }

      comment.feedback = feedback;
      await commentRepository.save(comment);

      return res.status(200).json({ message: "Feedback added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getDashboard = async (req: AuthRequest, res: Response) => {
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const isAdmin =
        req.user?.role === "admin" || req.user?.role === "super_admin";
      const userId = req.user?.id;

      if (isAdmin) {
        const total = await taskRepository.count();
        const pending = await taskRepository.count({
          where: { status: TaskStatus.PENDING },
        });
        const inProgress = await taskRepository.count({
          where: { status: TaskStatus.IN_PROGRESS },
        });
        const completed = await taskRepository.count({
          where: { status: TaskStatus.COMPLETED },
        });
        const highPriorityTasks = await taskRepository.find({
          where: { priority: TaskPriority.HIGH },
          relations: ["assignedUsers"],
          order: { createdAt: "DESC" },
        });

        return res
          .status(200)
          .json({ total, pending, inProgress, completed, highPriorityTasks });
      }

      const total = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .getCount();
      const pending = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.status = :status", { status: TaskStatus.PENDING })
        .getCount();
      const inProgress = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.status = :status", { status: TaskStatus.IN_PROGRESS })
        .getCount();
      const completed = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.status = :status", { status: TaskStatus.COMPLETED })
        .getCount();
      const highPriorityTasks = await taskRepository
        .createQueryBuilder("task")
        .leftJoinAndSelect("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.priority = :priority", { priority: TaskPriority.HIGH })
        .orderBy("task.createdAt", "DESC")
        .getMany();

      return res
        .status(200)
        .json({ total, pending, inProgress, completed, highPriorityTasks });
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

  static addSubTaskComment = async (req: AuthRequest, res: Response) => {
    console.log("=== addSubTaskComment CALLED ===");
    console.log("Params:", req.params);
    const { taskId, subtaskId } = req.params;
    const { commentText } = req.body;

    if (!commentText)
      return res.status(400).json({ message: "Comment text is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const commentRepository = AppDataSource.getRepository(SubTaskComment);
      const userRepository = AppDataSource.getRepository(User);

      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const subTask = await subTaskRepository.findOne({
        where: {
          id: parseInt(subtaskId as string),
          task: { id: parseInt(taskId as string) },
        },
      });

      if (!subTask)
        return res.status(404).json({ message: "Subtask not found" });

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) return res.status(404).json({ message: "User not found" });

      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.id === user.id,
      );
      if (
        !isAssigned &&
        req.user?.role !== "admin" &&
        req.user?.role !== "super_admin"
      )
        return res.status(403).json({ message: "Forbidden" });

      const comment = commentRepository.create({
        commentText,
        author: user,
        subTask,
      });
      await commentRepository.save(comment);

      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getSubTaskComments = async (req: AuthRequest, res: Response) => {
    console.log("=== getSubTaskComments CALLED ===");
    console.log("Params:", req.params);
    const { taskId, subtaskId } = req.params;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const commentRepository = AppDataSource.getRepository(SubTaskComment);

      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const subTask = await subTaskRepository.findOne({
        where: {
          id: parseInt(subtaskId as string),
          task: { id: parseInt(taskId as string) },
        },
      });

      if (!subTask)
        return res.status(404).json({ message: "Subtask not found" });

      if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        const isAssigned = task.assignedUsers.some(
          (assigned) => assigned.id === req.user?.id,
        );
        if (!isAssigned) return res.status(403).json({ message: "Forbidden" });
      }

      const comments = await commentRepository.find({
        where: { subTask: { id: subTask.id } },
        relations: ["author"],
        order: { createdAt: "ASC" },
      });

      return res.status(200).json(comments);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addSubTaskFeedback = async (req: AuthRequest, res: Response) => {
    const { taskId, subtaskId, commentId } = req.params;
    const { feedback } = req.body;

    if (!feedback)
      return res.status(400).json({ message: "Feedback is required" });

    try {
      const commentRepository = AppDataSource.getRepository(SubTaskComment);
      const comment = await commentRepository.findOne({
        where: { id: parseInt(commentId as string) },
        relations: ["subTask", "subTask.task", "subTask.task.assignedUsers"],
      });

      if (
        !comment ||
        comment.subTask.id !== parseInt(subtaskId as string) ||
        comment.subTask.task.id !== parseInt(taskId as string)
      ) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Only allow admin/super_admin to add feedback
      if (req.user?.role !== "admin" && req.user?.role !== "super_admin")
        return res.status(403).json({ message: "Forbidden" });

      comment.feedback = feedback;
      await commentRepository.save(comment);

      return res.status(200).json({ message: "Feedback added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
