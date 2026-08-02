"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const emailService_1 = require("../utils/emailService");
const subtaskTree_1 = require("../utils/subtaskTree");
const hierarchyAuthority_1 = require("../utils/hierarchyAuthority");
const simpleArray_1 = require("../utils/simpleArray");
const notificationService_1 = require("../services/notificationService");
// Falls back by NODE_ENV (not just a single hardcoded default) so a missing
// FRONTEND_URL env var still points production task-assignment emails at the
// deployed frontend instead of localhost — same pattern as InviteController.
const FRONTEND_URL = process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === "production"
        ? "https://www.jdnenergy.com.np"
        : "http://localhost:5173");
const sanitizeCreatedBy = (task) => {
    if (task.createdBy) {
        const { id, fullName, email } = task.createdBy;
        task.createdBy = { id, fullName, email };
    }
};
/** Flattens Prisma's TaskAssignee join rows / raw `files` text column back
 * into the plain shape the frontend has always received. */
const shapeTask = (task) => ({
    ...task,
    files: (0, simpleArray_1.toSimpleArray)(task.files),
    assignedUsers: Array.isArray(task.assignedUsers)
        ? task.assignedUsers.map((a) => a.user)
        : task.assignedUsers,
});
// childTasks: Gantt-nested children (Task.parentTaskId, set via the Schedule
// tab's "add child task") — surfaced as a lightweight summary so a task's
// subtasks can be shown nested under it instead of also listed as their own
// top-level tasks (see TaskController.getAllTasks, which filters them out of
// the top-level list using parentTaskId).
const TASK_LIST_INCLUDE = {
    assignedUsers: { include: { user: true } },
    project: true,
    comments: true,
    createdBy: true,
    childTasks: { select: { id: true, title: true, status: true, progress: true } },
};
const TASK_DETAIL_INCLUDE = {
    assignedUsers: { include: { user: true } },
    project: true,
    comments: { include: { author: true } },
    createdBy: true,
    childTasks: { select: { id: true, title: true, status: true, progress: true } },
};
async function attachSubTaskTrees(tasks) {
    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length === 0)
        return new Map();
    const allSubTasks = await prisma_1.prisma.subTask.findMany({
        where: { taskId: { in: taskIds } },
        include: { parent: true },
    });
    const subTasksByTask = new Map();
    allSubTasks.forEach((st) => {
        const taskId = st.taskId;
        if (!subTasksByTask.has(taskId))
            subTasksByTask.set(taskId, []);
        subTasksByTask.get(taskId).push({ ...st, history: st.history ? JSON.parse(st.history) : [] });
    });
    const treesByTask = new Map();
    subTasksByTask.forEach((subTasks, taskId) => {
        treesByTask.set(taskId, (0, subtaskTree_1.buildSubTaskTree)(subTasks));
    });
    return treesByTask;
}
class TaskController {
    static createTask = async (req, res) => {
        const { title, description, priority, dueDate, userIds, assignAll, projectId, progress, subTasks, projectName, } = req.body;
        const files = req.files;
        if (!title || !priority || !dueDate) {
            return res
                .status(400)
                .json({ message: "All fields except assignments are required" });
        }
        try {
            let assignedUsers = [];
            let project = null;
            let parsedUserIds = [];
            if (userIds) {
                if (Array.isArray(userIds)) {
                    parsedUserIds = userIds.map((id) => parseInt(id.toString()));
                }
                else if (typeof userIds === "string") {
                    parsedUserIds = userIds
                        .split(",")
                        .map((id) => parseInt(id.trim()))
                        .filter((id) => !isNaN(id));
                }
            }
            const actorId = req.user.id;
            const actorRole = req.user.role;
            const organizationId = req.organization.id;
            const isSuperAdmin = actorRole === enums_1.UserRole.SUPER_ADMIN;
            if (assignAll === "true" || assignAll === true) {
                if (isSuperAdmin) {
                    assignedUsers = (await prisma_1.prisma.organizationMembership.findMany({
                        where: { organizationId },
                        include: { user: true },
                    })).map((m) => m.user);
                }
                else {
                    // Non-root actors can only ever assign within their own reporting
                    // line — "all" means "all of my descendants", not the organization.
                    const descendantIds = await (0, hierarchyAuthority_1.getDescendantUserIds)(organizationId, actorId);
                    const ids = Array.from(new Set([actorId, ...descendantIds]));
                    assignedUsers = await prisma_1.prisma.user.findMany({ where: { id: { in: ids } } });
                }
            }
            else if (parsedUserIds.length > 0) {
                if (!isSuperAdmin) {
                    const descendantIds = new Set(await (0, hierarchyAuthority_1.getDescendantUserIds)(organizationId, actorId));
                    const invalidIds = parsedUserIds.filter((id) => id !== actorId && !descendantIds.has(id));
                    if (invalidIds.length > 0) {
                        return res.status(403).json({
                            message: "You can only assign a task to yourself or someone below you in the hierarchy",
                        });
                    }
                }
                assignedUsers = await prisma_1.prisma.user.findMany({ where: { id: { in: parsedUserIds } } });
            }
            if (projectId) {
                project = await prisma_1.prisma.project.findUnique({
                    where: { id: parseInt(projectId) },
                });
                if (!project)
                    return res.status(404).json({ message: "Project not found" });
            }
            const filePaths = files ? files.map((file) => file.path) : [];
            const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const newTaskRow = await prisma_1.prisma.task.create({
                data: {
                    title,
                    ...(description !== undefined ? { description } : {}),
                    priority: priority,
                    status: enums_1.TaskStatus.PENDING,
                    dueDate: new Date(dueDate),
                    files: (0, simpleArray_1.fromSimpleArray)(filePaths),
                    progress: progress ? parseInt(progress) : 0,
                    projectName: (projectName || null),
                    createdById: user.id,
                    organizationId,
                    ...(project ? { projectId: project.id } : {}),
                    assignedUsers: {
                        create: assignedUsers.map((u) => ({ userId: u.id })),
                    },
                },
            });
            const newTask = {
                ...newTaskRow,
                files: filePaths,
                assignedUsers,
                project,
                createdBy: user,
            };
            if (assignedUsers.length > 0) {
                const assignedByName = user?.fullName || "Someone";
                (0, notificationService_1.notifyUsers)(assignedUsers.map((u) => u.id).filter((id) => id !== actorId), {
                    organizationId,
                    type: "task_assigned",
                    title: "New task assigned",
                    message: `${assignedByName} assigned you to "${title}"`,
                    link: `/${organizationId}/tasks`,
                }).catch((err) => console.error("Failed to send task-assigned notification:", err));
            }
            // Send email notifications to assigned users
            console.log("[Task Create] Checking assigned users:", assignedUsers.length);
            if (assignedUsers.length > 0) {
                const recipientEmails = assignedUsers
                    .map((u) => u.email)
                    .filter((email) => email);
                console.log("[Task Create] Recipient emails:", recipientEmails);
                console.log("[Task Create] RESEND_API_KEY present?", !!process.env.RESEND_API_KEY);
                console.log("[Task Create] RESEND_FROM_EMAIL:", process.env.RESEND_FROM_EMAIL);
                const assignedBy = user?.fullName || "EMS Administrator";
                const emailSubject = `New Task Assigned: ${title}`;
                const dashboardUrl = `${FRONTEND_URL}/${req.organization.id}/dashboard`;
                const priorityColors = {
                    LOW: "#10b981",
                    MEDIUM: "#f59e0b",
                    HIGH: "#ef4444",
                    URGENT: "#dc2626",
                };
                const priorityColor = priorityColors[priority] || "#6366f1";
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
                          ${description
                    ? `
                          <tr>
                            <td style="padding-top: 12px; border-top: 1px solid #e2e8f0;">
                              <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Description</p>
                              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">${description}</p>
                            </td>
                          </tr>
                          `
                    : ""}
                          ${projectName
                    ? `
                          <tr>
                            <td style="padding-top: 12px; border-top: 1px solid #e2e8f0;">
                              <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project</p>
                              <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0;">${projectName}</p>
                            </td>
                          </tr>
                          `
                    : ""}
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
                (0, emailService_1.sendEmail)(recipientEmails, emailSubject, emailText, emailHtml, "task-assignment")
                    .then((success) => {
                    console.log("[Task Create] sendEmail returned success:", success);
                })
                    .catch((err) => {
                    console.error("[Task Create] Failed to send task assignment emails:", err);
                });
            }
            else {
                console.log("[Task Create] No assigned users, skipping emails");
            }
            // Handle subTasks (supports nested)
            if (subTasks) {
                const parsedSubTasks = typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
                if (Array.isArray(parsedSubTasks)) {
                    await (0, subtaskTree_1.saveSubTasks)(parsedSubTasks, newTask.id);
                }
            }
            // Fetch all subtasks to return the complete tree with real DB IDs
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(newTask.id);
            newTask.subTasks = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            if (newTask.subTasks.length > 0) {
                const avg = (0, subtaskTree_1.computeAverageLeafProgress)(newTask.subTasks);
                newTask.progress = avg;
                await prisma_1.prisma.task.update({ where: { id: newTask.id }, data: { progress: avg } });
            }
            sanitizeCreatedBy(newTask);
            return res.status(201).json({
                message: "Task created and assigned successfully",
                task: newTask,
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getAllTasks = async (req, res) => {
        try {
            const organization = req.organization;
            let tasks;
            if (req.user?.role === enums_1.UserRole.SUPER_ADMIN) {
                // Super admin sees every task in the organization.
                tasks = await prisma_1.prisma.task.findMany({
                    where: { organizationId: organization.id },
                    include: TASK_LIST_INCLUDE,
                    orderBy: { createdAt: "desc" },
                });
            }
            else {
                // Everyone else (including regular admins) only sees a task if they
                // assigned it (created it) or were assigned to it.
                tasks = await prisma_1.prisma.task.findMany({
                    where: {
                        organizationId: organization.id,
                        OR: [
                            { assignedUsers: { some: { userId: req.user.id } } },
                            { createdById: req.user.id },
                        ],
                    },
                    include: TASK_LIST_INCLUDE,
                    orderBy: { createdAt: "desc" },
                });
            }
            // Gantt-nested children (Task.parentTaskId, set via the Schedule tab's
            // "add child task") are kept in `tasks` (so they're still individually
            // findable by id when a parent's "Sub-Tasks" list is clicked — see
            // MyTasks/AssignedTasks/CompletedTasks) but filtered out of the
            // top-level list the frontend renders as its own card, since they're
            // shown nested under their parent (childTasks) instead. Frontend does
            // this filtering, not here, so `tasks` stays the full lookup set.
            const treesByTask = await attachSubTaskTrees(tasks);
            const shaped = tasks.map((task) => {
                const shapedTask = shapeTask(task);
                sanitizeCreatedBy(shapedTask);
                shapedTask.subTasks = treesByTask.get(task.id) || [];
                shapedTask.progress = (0, subtaskTree_1.computeAverageLeafProgress)(shapedTask.subTasks);
                return shapedTask;
            });
            return res.status(200).json(shaped);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateTaskProgress = async (req, res) => {
        const { id } = req.params;
        const { progress } = req.body;
        if (progress === undefined || progress === null) {
            return res.status(400).json({ message: "Progress is required" });
        }
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(id) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const userId = req.user?.id;
            const isAssigned = task.assignedUsers.some((a) => a.userId === userId);
            if (!isAssigned &&
                req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
                return res
                    .status(403)
                    .json({ message: "Forbidden: You are not assigned to this task." });
            }
            const updated = await prisma_1.prisma.task.update({
                where: { id: task.id },
                data: { progress: parseInt(progress) },
            });
            return res
                .status(200)
                .json({ message: "Task progress updated successfully", task: updated });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getTaskById = async (req, res) => {
        const { id } = req.params;
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(id) },
                include: TASK_DETAIL_INCLUDE,
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            if (req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
                // Only the assigner (creator) and the assignees may view a task.
                const assignedToUser = task.assignedUsers.some((a) => a.userId === req.user?.id);
                const isCreator = task.createdById === req.user?.id;
                if (!assignedToUser && !isCreator)
                    return res.status(403).json({ message: "Forbidden" });
            }
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(task.id);
            const shapedTask = shapeTask(task);
            shapedTask.subTasks = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            shapedTask.progress = (0, subtaskTree_1.computeAverageLeafProgress)(shapedTask.subTasks);
            sanitizeCreatedBy(shapedTask);
            return res.status(200).json(shapedTask);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateTask = async (req, res) => {
        const { id } = req.params;
        const { title, description, priority, dueDate, status, userIds, assignAll, projectId, progress, subTasks, projectName, } = req.body;
        const files = req.files;
        try {
            const taskId = parseInt(id);
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: taskId },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const previousAssigneeIds = new Set(task.assignedUsers.map((a) => a.userId));
            const data = {};
            if (title)
                data.title = title;
            if (description !== undefined)
                data.description = description;
            if (priority)
                data.priority = priority;
            if (status && Object.values(enums_1.TaskStatus).includes(status))
                data.status = status;
            if (dueDate)
                data.dueDate = new Date(dueDate);
            if (progress !== undefined)
                data.progress = parseInt(progress);
            if (projectName !== undefined)
                data.projectName = projectName;
            if (projectId) {
                const project = await prisma_1.prisma.project.findUnique({
                    where: { id: parseInt(projectId) },
                });
                if (!project)
                    return res.status(404).json({ message: "Project not found" });
                data.projectId = project.id;
            }
            let parsedUserIds = [];
            if (userIds !== undefined && userIds !== null) {
                if (Array.isArray(userIds)) {
                    parsedUserIds = userIds.map((id) => parseInt(id.toString()));
                }
                else if (typeof userIds === "string") {
                    parsedUserIds = userIds
                        .split(",")
                        .map((id) => parseInt(id.trim()))
                        .filter((id) => !isNaN(id));
                }
            }
            const actorId = req.user.id;
            const actorRole = req.user.role;
            const organizationId = req.organization.id;
            const isSuperAdmin = actorRole === enums_1.UserRole.SUPER_ADMIN;
            let newAssignedUserIds = null;
            if (assignAll === "true" || assignAll === true) {
                if (isSuperAdmin) {
                    newAssignedUserIds = (await prisma_1.prisma.organizationMembership.findMany({
                        where: { organizationId },
                        select: { userId: true },
                    })).map((m) => m.userId);
                }
                else {
                    const descendantIds = await (0, hierarchyAuthority_1.getDescendantUserIds)(organizationId, actorId);
                    newAssignedUserIds = Array.from(new Set([actorId, ...descendantIds]));
                }
            }
            else if (userIds !== undefined && userIds !== null) {
                if (!isSuperAdmin && parsedUserIds.length > 0) {
                    const descendantIds = new Set(await (0, hierarchyAuthority_1.getDescendantUserIds)(organizationId, actorId));
                    const invalidIds = parsedUserIds.filter((uid) => uid !== actorId && !descendantIds.has(uid));
                    if (invalidIds.length > 0) {
                        return res.status(403).json({
                            message: "You can only assign a task to yourself or someone below you in the hierarchy",
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
                data.files = (0, simpleArray_1.fromSimpleArray)([...(0, simpleArray_1.toSimpleArray)(task.files), ...newFilePaths]);
            }
            // Handle subTasks (supports nested) — UPDATE existing ones to preserve history/progress
            if (subTasks) {
                const parsedSubTasks = typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
                if (Array.isArray(parsedSubTasks)) {
                    // 1. Fetch all existing subtasks for this task
                    const existingSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(task.id);
                    const existingSubTasksMap = new Map();
                    existingSubTasks.forEach((st) => existingSubTasksMap.set(String(st.id), st));
                    // 2. Helper to update or create subtasks recursively
                    const updateOrCreateSubTasks = async (subTasksList, parentSubTaskId) => {
                        for (const subTaskData of subTasksList) {
                            if (!subTaskData.title)
                                continue;
                            const subTaskIdStr = String(subTaskData.id);
                            let subTaskId;
                            const rawEstimatedDays = subTaskData.estimatedDays;
                            const estimatedDays = rawEstimatedDays !== undefined && rawEstimatedDays !== null && rawEstimatedDays !== ""
                                ? Number(rawEstimatedDays)
                                : undefined;
                            const hasValidEstimatedDays = estimatedDays !== undefined && Number.isFinite(estimatedDays) && estimatedDays >= 0;
                            if (existingSubTasksMap.has(subTaskIdStr) &&
                                !subTaskIdStr.startsWith("temp-")) {
                                // Update existing subtask (preserve history, progress!)
                                const existing = existingSubTasksMap.get(subTaskIdStr);
                                subTaskId = existing.id;
                                await prisma_1.prisma.subTask.update({
                                    where: { id: subTaskId },
                                    data: {
                                        title: subTaskData.title,
                                        ...(hasValidEstimatedDays ? { estimatedDays } : {}),
                                        ...(parentSubTaskId !== undefined ? { parentId: parentSubTaskId } : {}),
                                    },
                                });
                                existingSubTasksMap.delete(subTaskIdStr); // Mark as processed
                            }
                            else {
                                // Create new subtask
                                const created = await prisma_1.prisma.subTask.create({
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
                            if (Array.isArray(subTaskData.subTasks) &&
                                subTaskData.subTasks.length > 0) {
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
                        await prisma_1.prisma.subTask.deleteMany({ where: { id: { in: idsToDelete } } });
                    }
                }
            }
            await prisma_1.prisma.task.update({ where: { id: task.id }, data });
            if (newAssignedUserIds !== null) {
                const newlyAdded = newAssignedUserIds.filter((uid) => !previousAssigneeIds.has(uid) && uid !== actorId);
                if (newlyAdded.length > 0) {
                    const actor = await prisma_1.prisma.user.findUnique({ where: { id: actorId } });
                    (0, notificationService_1.notifyUsers)(newlyAdded, {
                        organizationId,
                        type: "task_assigned",
                        title: "New task assigned",
                        message: `${actor?.fullName || "Someone"} assigned you to "${task.title}"`,
                        link: `/${organizationId}/tasks`,
                    }).catch((err) => console.error("Failed to send task-assigned notification:", err));
                }
            }
            if (data.status === enums_1.TaskStatus.COMPLETED && task.status !== enums_1.TaskStatus.COMPLETED) {
                const recipientIds = Array.from(new Set([task.createdById, ...task.assignedUsers.map((a) => a.userId)].filter((uid) => uid != null && uid !== actorId)));
                if (recipientIds.length > 0) {
                    (0, notificationService_1.notifyUsers)(recipientIds, {
                        organizationId,
                        type: "task_completed",
                        title: "Task completed",
                        message: `"${task.title}" was marked as completed`,
                        link: `/${organizationId}/tasks`,
                    }).catch((err) => console.error("Failed to send task-completed notification:", err));
                }
            }
            // Refetch task WITHOUT subTasks relations (we will build it manually)
            const updatedTaskRow = await prisma_1.prisma.task.findUnique({
                where: { id: task.id },
                include: TASK_DETAIL_INCLUDE,
            });
            // Fetch ALL subtasks and build the complete tree
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(task.id);
            let updatedTask = null;
            if (updatedTaskRow) {
                updatedTask = shapeTask(updatedTaskRow);
                updatedTask.subTasks = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
                updatedTask.progress = (0, subtaskTree_1.computeAverageLeafProgress)(updatedTask.subTasks);
                await prisma_1.prisma.task.update({
                    where: { id: task.id },
                    data: { progress: updatedTask.progress },
                });
                sanitizeCreatedBy(updatedTask);
            }
            return res
                .status(200)
                .json({ message: "Task updated successfully", task: updatedTask });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateTaskStatus = async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ message: "Status is required" });
        const normalized = String(status).toLowerCase().replace(/\s+/g, "_");
        if (!Object.values(enums_1.TaskStatus).includes(normalized)) {
            return res.status(400).json({ message: "Invalid status value" });
        }
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(id) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const userId = req.user?.id;
            const isAssigned = task.assignedUsers.some((a) => a.userId === userId);
            if (!isAssigned &&
                req.user?.role !== enums_1.UserRole.ADMIN &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN)
                return res.status(403).json({ message: "Forbidden" });
            const updated = await prisma_1.prisma.task.update({
                where: { id: task.id },
                data: { status: normalized },
            });
            if (normalized === enums_1.TaskStatus.COMPLETED && task.status !== enums_1.TaskStatus.COMPLETED) {
                const recipientIds = Array.from(new Set([task.createdById, ...task.assignedUsers.map((a) => a.userId)].filter((uid) => uid != null && uid !== userId)));
                if (recipientIds.length > 0 && req.organization) {
                    (0, notificationService_1.notifyUsers)(recipientIds, {
                        organizationId: req.organization.id,
                        type: "task_completed",
                        title: "Task completed",
                        message: `"${task.title}" was marked as completed`,
                        link: `/${req.organization.id}/tasks`,
                    }).catch((err) => console.error("Failed to send task-completed notification:", err));
                }
            }
            return res.status(200).json({ message: "Task status updated", task: updated });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getTasksByProject = async (req, res) => {
        const { projectId } = req.params;
        try {
            const projectIdInt = parseInt(projectId);
            const projectTasks = await prisma_1.prisma.task.findMany({
                where: { projectId: projectIdInt },
                include: TASK_LIST_INCLUDE,
                orderBy: { createdAt: "desc" },
            });
            let tasksToReturn = projectTasks;
            if (req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
                // Only the assigner (creator) and the assignees may view a task.
                tasksToReturn = projectTasks.filter((task) => task.assignedUsers.some((a) => a.userId === req.user?.id) ||
                    task.createdById === req.user?.id);
            }
            const treesByTask = await attachSubTaskTrees(tasksToReturn);
            const shaped = tasksToReturn.map((task) => {
                const shapedTask = shapeTask(task);
                sanitizeCreatedBy(shapedTask);
                shapedTask.subTasks = treesByTask.get(task.id) || [];
                return shapedTask;
            });
            return res.status(200).json(shaped);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static deleteTask = async (req, res) => {
        const { id } = req.params;
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(id) },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            await prisma_1.prisma.task.delete({ where: { id: task.id } });
            return res.status(200).json({ message: "Task deleted successfully" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.TaskController = TaskController;
//# sourceMappingURL=TaskController.js.map