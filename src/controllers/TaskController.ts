import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { TaskPriority, TaskStatus, UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
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
import { toSimpleArray, fromSimpleArray } from "../utils/simpleArray";

// Falls back by NODE_ENV (not just a single hardcoded default) so a missing
// FRONTEND_URL env var still points production task-assignment emails at the
// deployed frontend instead of localhost — same pattern as InviteController.
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://www.jdnenergy.com.np"
    : "http://localhost:5173");

const sanitizeCreatedBy = (task: any) => {
  if (task.createdBy) {
    const { id, fullName, email } = task.createdBy;
    task.createdBy = { id, fullName, email };
  }
};

/** Flattens Prisma's TaskAssignee join rows / raw `files` text column back
 * into the plain shape the frontend has always received. */
const shapeTask = (task: any) => ({
  ...task,
  files: toSimpleArray(task.files),
  assignedUsers: Array.isArray(task.assignedUsers)
    ? task.assignedUsers.map((a: any) => a.user)
    : task.assignedUsers,
});

const TASK_LIST_INCLUDE = {
  assignedUsers: { include: { user: true } },
  project: true,
  comments: true,
  createdBy: true,
} as const;

const TASK_DETAIL_INCLUDE = {
  assignedUsers: { include: { user: true } },
  project: true,
  comments: { include: { author: true } },
  createdBy: true,
} as const;

async function attachSubTaskTrees(tasks: { id: number }[]): Promise<Map<number, any[]>> {
  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length === 0) return new Map();

  const allSubTasks = await prisma.subTask.findMany({
    where: { taskId: { in: taskIds } },
    include: { parent: true },
  });

  const subTasksByTask = new Map<number, any[]>();
  allSubTasks.forEach((st) => {
    const taskId = st.taskId!;
    if (!subTasksByTask.has(taskId)) subTasksByTask.set(taskId, []);
    subTasksByTask.get(taskId)!.push({ ...st, history: st.history ? JSON.parse(st.history) : [] });
  });

  const treesByTask = new Map<number, any[]>();
  subTasksByTask.forEach((subTasks, taskId) => {
    treesByTask.set(taskId, buildSubTaskTree(subTasks));
  });
  return treesByTask;
}

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
      let assignedUsers: { id: number; fullName: string; email: string }[] = [];
      let project = null as Awaited<ReturnType<typeof prisma.project.findUnique>> | null;

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
      const organizationId = req.organization!.id;
      const isSuperAdmin = actorRole === UserRole.SUPER_ADMIN;

      if (assignAll === "true" || assignAll === true) {
        if (isSuperAdmin) {
          assignedUsers = (
            await prisma.organizationMembership.findMany({
              where: { organizationId },
              include: { user: true },
            })
          ).map((m) => m.user);
        } else {
          // Non-root actors can only ever assign within their own reporting
          // line — "all" means "all of my descendants", not the organization.
          const descendantIds = await getDescendantUserIds(organizationId, actorId);
          const ids = Array.from(new Set([actorId, ...descendantIds]));
          assignedUsers = await prisma.user.findMany({ where: { id: { in: ids } } });
        }
      } else if (parsedUserIds.length > 0) {
        if (!isSuperAdmin) {
          const descendantIds = new Set(await getDescendantUserIds(organizationId, actorId));
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
        assignedUsers = await prisma.user.findMany({ where: { id: { in: parsedUserIds } } });
      }

      if (projectId) {
        project = await prisma.project.findUnique({
          where: { id: parseInt(projectId as string) },
        });
        if (!project)
          return res.status(404).json({ message: "Project not found" });
      }

      const filePaths = files ? files.map((file) => file.path) : [];

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

      const newTaskRow = await prisma.task.create({
        data: {
          title,
          ...(description !== undefined ? { description } : {}),
          priority: priority as TaskPriority,
          status: TaskStatus.PENDING,
          dueDate: new Date(dueDate),
          files: fromSimpleArray(filePaths),
          progress: progress ? parseInt(progress as string) : 0,
          projectName: (projectName || null) as string,
          createdById: user!.id,
          organizationId,
          ...(project ? { projectId: project.id } : {}),
          assignedUsers: {
            create: assignedUsers.map((u) => ({ userId: u.id })),
          },
        },
      });

      const newTask: any = {
        ...newTaskRow,
        files: filePaths,
        assignedUsers,
        project,
        createdBy: user,
      };

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
        const dashboardUrl = `${FRONTEND_URL}/${req.organization!.id}/dashboard`;
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
          await saveSubTasks(parsedSubTasks, newTask.id);
        }
      }

      // Fetch all subtasks to return the complete tree with real DB IDs
      const allSubTasks = await fetchSubTasksForTask(newTask.id);
      newTask.subTasks = buildSubTaskTree(allSubTasks);
      if (newTask.subTasks.length > 0) {
        const avg = computeAverageLeafProgress(newTask.subTasks);
        newTask.progress = avg;
        await prisma.task.update({ where: { id: newTask.id }, data: { progress: avg } });
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
      const organization = req.organization!;
      let tasks;

      if (req.user?.role === UserRole.SUPER_ADMIN) {
        // Super admin sees every task in the organization.
        tasks = await prisma.task.findMany({
          where: { organizationId: organization.id },
          include: TASK_LIST_INCLUDE,
          orderBy: { createdAt: "desc" },
        });
      } else {
        // Everyone else (including regular admins) only sees a task if they
        // assigned it (created it) or were assigned to it.
        tasks = await prisma.task.findMany({
          where: {
            organizationId: organization.id,
            OR: [
              { assignedUsers: { some: { userId: req.user!.id } } },
              { createdById: req.user!.id },
            ],
          },
          include: TASK_LIST_INCLUDE,
          orderBy: { createdAt: "desc" },
        });
      }

      const treesByTask = await attachSubTaskTrees(tasks);
      const shaped = tasks.map((task) => {
        const shapedTask = shapeTask(task);
        sanitizeCreatedBy(shapedTask);
        shapedTask.subTasks = treesByTask.get(task.id) || [];
        shapedTask.progress = computeAverageLeafProgress(shapedTask.subTasks);
        return shapedTask;
      });

      return res.status(200).json(shaped);
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
      const task = await prisma.task.findUnique({
        where: { id: parseInt(id as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((a) => a.userId === userId);

      if (
        !isAssigned &&
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      ) {
        return res
          .status(403)
          .json({ message: "Forbidden: You are not assigned to this task." });
      }

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { progress: parseInt(progress as string) },
      });

      return res
        .status(200)
        .json({ message: "Task progress updated successfully", task: updated });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTaskById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const task = await prisma.task.findUnique({
        where: { id: parseInt(id as string) },
        include: TASK_DETAIL_INCLUDE,
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (req.user?.role !== UserRole.SUPER_ADMIN) {
        // Only the assigner (creator) and the assignees may view a task.
        const assignedToUser = task.assignedUsers.some(
          (a) => a.userId === req.user?.id,
        );
        const isCreator = task.createdById === req.user?.id;
        if (!assignedToUser && !isCreator)
          return res.status(403).json({ message: "Forbidden" });
      }

      const allSubTasks = await fetchSubTasksForTask(task.id);
      const shapedTask: any = shapeTask(task);
      shapedTask.subTasks = buildSubTaskTree(allSubTasks);
      shapedTask.progress = computeAverageLeafProgress(shapedTask.subTasks);
      sanitizeCreatedBy(shapedTask);

      return res.status(200).json(shapedTask);
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
      const taskId = parseInt(id as string);
      const task = await prisma.task.findUnique({ where: { id: taskId } });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const data: any = {};
      if (title) data.title = title;
      if (description !== undefined) data.description = description;
      if (priority) data.priority = priority as TaskPriority;
      if (status && Object.values(TaskStatus).includes(status as TaskStatus))
        data.status = status as TaskStatus;
      if (dueDate) data.dueDate = new Date(dueDate);
      if (progress !== undefined) data.progress = parseInt(progress as string);
      if (projectName !== undefined) data.projectName = projectName;

      if (projectId) {
        const project = await prisma.project.findUnique({
          where: { id: parseInt(projectId as string) },
        });
        if (!project)
          return res.status(404).json({ message: "Project not found" });
        data.projectId = project.id;
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
      const organizationId = req.organization!.id;
      const isSuperAdmin = actorRole === UserRole.SUPER_ADMIN;

      let newAssignedUserIds: number[] | null = null;
      if (assignAll === "true" || assignAll === true) {
        if (isSuperAdmin) {
          newAssignedUserIds = (
            await prisma.organizationMembership.findMany({
              where: { organizationId },
              select: { userId: true },
            })
          ).map((m) => m.userId);
        } else {
          const descendantIds = await getDescendantUserIds(organizationId, actorId);
          newAssignedUserIds = Array.from(new Set([actorId, ...descendantIds]));
        }
      } else if (userIds !== undefined && userIds !== null) {
        if (!isSuperAdmin && parsedUserIds.length > 0) {
          const descendantIds = new Set(await getDescendantUserIds(organizationId, actorId));
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
        newAssignedUserIds = parsedUserIds;
      }

      if (newAssignedUserIds !== null) {
        data.assignedUsers = {
          deleteMany: {},
          create: newAssignedUserIds.map((userId) => ({ userId })),
        };
      }

      if (files && files.length > 0) {
        const newFilePaths = files.map((file) => file.path);
        data.files = fromSimpleArray([...toSimpleArray(task.files), ...newFilePaths]);
      }

      // Handle subTasks (supports nested) — UPDATE existing ones to preserve history/progress
      if (subTasks) {
        const parsedSubTasks =
          typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
        if (Array.isArray(parsedSubTasks)) {
          // 1. Fetch all existing subtasks for this task
          const existingSubTasks = await fetchSubTasksForTask(task.id);
          const existingSubTasksMap = new Map<string, (typeof existingSubTasks)[number]>();
          existingSubTasks.forEach((st) =>
            existingSubTasksMap.set(String(st.id), st),
          );

          // 2. Helper to update or create subtasks recursively
          const updateOrCreateSubTasks = async (
            subTasksList: any[],
            parentSubTaskId?: number,
          ): Promise<void> => {
            for (const subTaskData of subTasksList) {
              if (!subTaskData.title) continue;

              const subTaskIdStr = String(subTaskData.id);
              let subTaskId: number;

              const rawEstimatedDays = subTaskData.estimatedDays;
              const estimatedDays =
                rawEstimatedDays !== undefined && rawEstimatedDays !== null && rawEstimatedDays !== ""
                  ? Number(rawEstimatedDays)
                  : undefined;
              const hasValidEstimatedDays =
                estimatedDays !== undefined && Number.isFinite(estimatedDays) && estimatedDays >= 0;

              if (
                existingSubTasksMap.has(subTaskIdStr) &&
                !subTaskIdStr.startsWith("temp-")
              ) {
                // Update existing subtask (preserve history, progress!)
                const existing = existingSubTasksMap.get(subTaskIdStr)!;
                subTaskId = existing.id;
                await prisma.subTask.update({
                  where: { id: subTaskId },
                  data: {
                    title: subTaskData.title,
                    ...(hasValidEstimatedDays ? { estimatedDays } : {}),
                    ...(parentSubTaskId !== undefined ? { parentId: parentSubTaskId } : {}),
                  },
                });
                existingSubTasksMap.delete(subTaskIdStr); // Mark as processed
              } else {
                // Create new subtask
                const created = await prisma.subTask.create({
                  data: {
                    title: subTaskData.title,
                    taskId: task.id,
                    ...(hasValidEstimatedDays ? { estimatedDays } : {}),
                    ...(parentSubTaskId !== undefined ? { parentId: parentSubTaskId } : {}),
                  },
                });
                subTaskId = created.id;
              }

              // Process children
              if (
                Array.isArray(subTaskData.subTasks) &&
                subTaskData.subTasks.length > 0
              ) {
                await updateOrCreateSubTasks(subTaskData.subTasks, subTaskId);
              }
            }
          };

          // 3. Process the parsed subtasks
          await updateOrCreateSubTasks(parsedSubTasks);

          // 4. Delete remaining (unprocessed) existing subtasks. Any subtask
          // that was kept already had its parentId reassigned above (to
          // wherever the payload put it), so it's no longer a DB child of
          // any node still in this set — a single bulk delete (letting
          // onDelete: Cascade handle any subtask-of-a-subtask still in this
          // same set) reaches the identical end state as deleting leaves
          // first.
          const idsToDelete = Array.from(existingSubTasksMap.values()).map((st) => st.id);
          if (idsToDelete.length > 0) {
            await prisma.subTask.deleteMany({ where: { id: { in: idsToDelete } } });
          }
        }
      }

      await prisma.task.update({ where: { id: task.id }, data });

      // Refetch task WITHOUT subTasks relations (we will build it manually)
      const updatedTaskRow = await prisma.task.findUnique({
        where: { id: task.id },
        include: TASK_DETAIL_INCLUDE,
      });

      // Fetch ALL subtasks and build the complete tree
      const allSubTasks = await fetchSubTasksForTask(task.id);

      let updatedTask: any = null;
      if (updatedTaskRow) {
        updatedTask = shapeTask(updatedTaskRow);
        updatedTask.subTasks = buildSubTaskTree(allSubTasks);
        updatedTask.progress = computeAverageLeafProgress(updatedTask.subTasks);
        await prisma.task.update({
          where: { id: task.id },
          data: { progress: updatedTask.progress },
        });
        sanitizeCreatedBy(updatedTask);
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
      const task = await prisma.task.findUnique({
        where: { id: parseInt(id as string) },
        include: { assignedUsers: true },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((a) => a.userId === userId);
      if (
        !isAssigned &&
        req.user?.role !== UserRole.ADMIN &&
        req.user?.role !== UserRole.SUPER_ADMIN
      )
        return res.status(403).json({ message: "Forbidden" });

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { status: normalized as TaskStatus },
      });

      return res.status(200).json({ message: "Task status updated", task: updated });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTasksByProject = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const projectIdInt = parseInt(projectId as string);
      const projectTasks = await prisma.task.findMany({
        where: { projectId: projectIdInt },
        include: TASK_LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
      });

      let tasksToReturn = projectTasks;
      if (req.user?.role !== UserRole.SUPER_ADMIN) {
        // Only the assigner (creator) and the assignees may view a task.
        tasksToReturn = projectTasks.filter(
          (task) =>
            task.assignedUsers.some((a) => a.userId === req.user?.id) ||
            task.createdById === req.user?.id,
        );
      }

      const treesByTask = await attachSubTaskTrees(tasksToReturn);
      const shaped = tasksToReturn.map((task) => {
        const shapedTask = shapeTask(task);
        sanitizeCreatedBy(shapedTask);
        shapedTask.subTasks = treesByTask.get(task.id) || [];
        return shapedTask;
      });

      return res.status(200).json(shaped);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const task = await prisma.task.findUnique({
        where: { id: parseInt(id as string) },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      await prisma.task.delete({ where: { id: task.id } });
      return res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
