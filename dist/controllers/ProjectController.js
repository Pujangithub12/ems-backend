"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
/** Deep relation tree matching the old QueryBuilder's leftJoinAndSelect chain:
 * assignees, files, headings -> tasks -> assignedUsers, headings -> subHeadings
 * -> tasks -> assignedUsers, and projectTasks -> assignedUsers. */
// Gantt-nested children (Task.parentTaskId, set via the Schedule tab's "add
// child task") — surfaced alongside every task list below so the Kanban
// drawer can show them too. Each child is also its own top-level row in
// whichever list it belongs to (this include is unfiltered), so this is
// just enough to render a summary list, not the full child record.
const CHILD_TASKS_INCLUDE = {
    childTasks: { select: { id: true, title: true, status: true, progress: true } },
};
const PROJECT_INCLUDE = {
    assignees: { include: { user: true } },
    files: true,
    headings: {
        include: {
            tasks: {
                include: { assignedUsers: { include: { user: true } }, ...CHILD_TASKS_INCLUDE },
            },
            subHeadings: {
                include: {
                    tasks: {
                        include: { assignedUsers: { include: { user: true } }, ...CHILD_TASKS_INCLUDE },
                    },
                },
            },
        },
    },
    projectTasks: {
        include: {
            assignedUsers: { include: { user: true } },
            ...CHILD_TASKS_INCLUDE,
        },
    },
};
/** Flattens a Prisma TaskAssignee join-row list back into the plain User[]
 * shape the frontend has always received for a task's assignedUsers. */
const shapeTaskAssignees = (task) => ({
    ...task,
    assignedUsers: Array.isArray(task.assignedUsers)
        ? task.assignedUsers.map((a) => a.user)
        : task.assignedUsers,
});
/** Flattens Prisma's ProjectAssignee join rows (and the same join rows nested
 * inside every task in the heading/subHeading/projectTasks trees) back into
 * the plain shape the frontend has always received. */
const shapeProject = (project) => ({
    ...project,
    assignees: Array.isArray(project.assignees)
        ? project.assignees.map((a) => a.user)
        : project.assignees,
    headings: Array.isArray(project.headings)
        ? project.headings.map((h) => ({
            ...h,
            tasks: Array.isArray(h.tasks) ? h.tasks.map(shapeTaskAssignees) : h.tasks,
            subHeadings: Array.isArray(h.subHeadings)
                ? h.subHeadings.map((sh) => ({
                    ...sh,
                    tasks: Array.isArray(sh.tasks) ? sh.tasks.map(shapeTaskAssignees) : sh.tasks,
                }))
                : h.subHeadings,
        }))
        : project.headings,
    projectTasks: Array.isArray(project.projectTasks)
        ? project.projectTasks.map(shapeTaskAssignees)
        : project.projectTasks,
});
const sanitizeAssignees = (project) => {
    if (project.assignees) {
        project.assignees = project.assignees.map((u) => {
            const { password, ...rest } = u;
            return rest;
        });
    }
};
class ProjectController {
    static createProject = async (req, res) => {
        const { name, description, dueDate, status, priority, assigneeIds, contractDate, kickoffDate, estimatedTotalCost, sellingPrice, } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Project name is required" });
        }
        try {
            const user = req.user;
            // Only admins or super admins can create projects
            if (user.role !== "admin" && user.role !== "super_admin") {
                return res
                    .status(403)
                    .json({ message: "Not authorized to create projects" });
            }
            let assignees = [];
            if (assigneeIds && Array.isArray(assigneeIds) && assigneeIds.length > 0) {
                assignees = await prisma_1.prisma.user.findMany({ where: { id: { in: assigneeIds } } });
            }
            const organization = req.organization;
            const newProjectRow = await prisma_1.prisma.project.create({
                data: {
                    name,
                    ...(description !== undefined ? { description } : {}),
                    status: status && Object.values(enums_1.TaskStatus).includes(status)
                        ? status
                        : enums_1.TaskStatus.PENDING,
                    priority: priority && Object.values(enums_1.TaskPriority).includes(priority)
                        ? priority
                        : enums_1.TaskPriority.MEDIUM,
                    organizationId: organization.id,
                    ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
                    ...(contractDate ? { contractDate: new Date(contractDate) } : {}),
                    ...(kickoffDate ? { kickoffDate: new Date(kickoffDate) } : {}),
                    ...(estimatedTotalCost !== undefined ? { estimatedTotalCost } : {}),
                    ...(sellingPrice !== undefined ? { sellingPrice } : {}),
                    assignees: {
                        create: assignees.map((u) => ({ userId: u.id })),
                    },
                },
            });
            const project = { ...newProjectRow, assignees, organization };
            return res.status(201).json({ message: "Project created", project });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getAllProjects = async (req, res) => {
        try {
            const organization = req.organization; // Assert not undefined (set by middleware)
            const user = req.user;
            let projects;
            if (user.role === "admin" || user.role === "super_admin") {
                // Admin or super admin see all projects
                projects = await prisma_1.prisma.project.findMany({
                    where: { organizationId: organization.id },
                    include: PROJECT_INCLUDE,
                    orderBy: { createdAt: "desc" },
                });
            }
            else {
                // Regular users only see projects they are assigned to
                projects = await prisma_1.prisma.project.findMany({
                    where: {
                        organizationId: organization.id,
                        assignees: { some: { userId: user.id } },
                    },
                    include: PROJECT_INCLUDE,
                    orderBy: { createdAt: "desc" },
                });
            }
            const shaped = projects.map(shapeProject);
            console.log("[ProjectController.getAllProjects] Projects count:", shaped.length);
            return res.status(200).json(shaped);
        }
        catch (error) {
            console.error("[ProjectController.getAllProjects] Error:", error);
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getProjectById = async (req, res) => {
        const { id } = req.params;
        const user = req.user;
        const organization = req.organization;
        try {
            let projectRow;
            if (user.role === "admin" || user.role === "super_admin") {
                projectRow = await prisma_1.prisma.project.findFirst({
                    where: {
                        id: parseInt(id),
                        organizationId: organization.id,
                    },
                    include: PROJECT_INCLUDE,
                });
            }
            else {
                // Check that the user is assigned to the project
                projectRow = await prisma_1.prisma.project.findFirst({
                    where: {
                        id: parseInt(id),
                        organizationId: organization.id,
                        assignees: { some: { userId: user.id } },
                    },
                    include: PROJECT_INCLUDE,
                });
            }
            if (!projectRow) {
                return res.status(404).json({ message: "Project not found" });
            }
            const project = shapeProject(projectRow);
            console.log("[ProjectController.getProjectById] Found project:", project?.id, project?.name);
            console.log("[ProjectController.getProjectById] projectTasks length:", project?.projectTasks?.length);
            console.log("[ProjectController.getProjectById] headings tasks:");
            project?.headings?.forEach((h) => {
                console.log(`  - Heading ${h.name}: ${h.tasks?.length} tasks`);
                h.subHeadings?.forEach((sh) => {
                    console.log(`    - Subheading ${sh.name}: ${sh.tasks?.length} tasks`);
                });
            });
            sanitizeAssignees(project);
            return res.status(200).json(project);
        }
        catch (error) {
            console.error("[ProjectController.getProjectById] Error:", error);
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static addProjectHeading = async (req, res) => {
        const { projectId } = req.params;
        const { name, parentHeadingId } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Heading name is required" });
        }
        try {
            const user = req.user;
            // Only admins or super admins can add headings
            if (user.role !== "admin" && user.role !== "super_admin") {
                return res
                    .status(403)
                    .json({ message: "Not authorized to add project headings" });
            }
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            let parentHeading;
            if (parentHeadingId) {
                parentHeading = await prisma_1.prisma.projectHeading.findFirst({
                    where: { id: parseInt(parentHeadingId) },
                });
            }
            const headingRow = await prisma_1.prisma.projectHeading.create({
                data: {
                    name,
                    projectId: project.id,
                    ...(parentHeading ? { parentHeadingId: parentHeading.id } : {}),
                },
            });
            const heading = { ...headingRow, project };
            if (parentHeading) {
                heading.parentHeading = parentHeading;
            }
            return res.status(201).json({ message: "Heading added", heading });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static addProjectTask = async (req, res) => {
        const { projectId } = req.params;
        const { description, dueDate, headingId, title, priority, assignedUserIds, status, } = req.body;
        if (!description || !dueDate || !title) {
            return res
                .status(400)
                .json({ message: "Task title, description and dueDate are required" });
        }
        try {
            const user = req.user;
            // Only admins or super admins can add project tasks
            if (user.role !== "admin" && user.role !== "super_admin") {
                return res
                    .status(403)
                    .json({ message: "Not authorized to add project tasks" });
            }
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            let heading;
            if (headingId) {
                heading = await prisma_1.prisma.projectHeading.findFirst({
                    where: { id: parseInt(headingId) },
                });
            }
            let assignedUsers = [];
            if (assignedUserIds && Array.isArray(assignedUserIds)) {
                // Any organization member can be assigned by anyone else in the
                // organization — assignment is no longer scoped by the hierarchy tree.
                const memberIds = new Set((await prisma_1.prisma.organizationMembership.findMany({
                    where: { organizationId: req.organization.id },
                    select: { userId: true },
                })).map((m) => m.userId));
                const invalidIds = assignedUserIds.filter((uid) => !memberIds.has(uid));
                if (invalidIds.length > 0) {
                    return res.status(403).json({
                        message: "You can only assign a task to members of this organization",
                    });
                }
                assignedUsers = await prisma_1.prisma.user.findMany({
                    where: { id: { in: assignedUserIds } },
                });
            }
            const organization = req.organization;
            const newTaskRow = await prisma_1.prisma.task.create({
                data: {
                    title,
                    description,
                    dueDate: new Date(dueDate),
                    priority: (priority || enums_1.TaskPriority.MEDIUM),
                    projectId: project.id,
                    projectName: project.name,
                    status: (status || enums_1.TaskStatus.PENDING),
                    progress: 0,
                    organizationId: organization.id,
                    ...(heading ? { projectHeadingId: heading.id } : {}),
                    assignedUsers: {
                        create: assignedUsers.map((u) => ({ userId: u.id })),
                    },
                },
            });
            const task = { ...newTaskRow, project, assignedUsers };
            if (heading) {
                task.projectHeading = heading;
            }
            return res.status(201).json({ message: "Task added", task });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateProjectTask = async (req, res) => {
        const { taskId } = req.params;
        const { description, dueDate, progress, status, priority, title } = req.body;
        try {
            const existing = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
            });
            if (!existing) {
                return res.status(404).json({ message: "Task not found" });
            }
            const data = {};
            if (title !== undefined)
                data.title = title;
            if (description !== undefined)
                data.description = description;
            if (dueDate !== undefined)
                data.dueDate = new Date(dueDate);
            if (progress !== undefined)
                data.progress = progress;
            if (status !== undefined)
                data.status = status;
            if (priority !== undefined)
                data.priority = priority;
            const task = await prisma_1.prisma.task.update({ where: { id: existing.id }, data });
            return res.status(200).json({ message: "Task updated", task });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static deleteProjectTask = async (req, res) => {
        const { taskId } = req.params;
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            await prisma_1.prisma.task.delete({ where: { id: task.id } });
            return res.status(200).json({ message: "Task deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateProject = async (req, res) => {
        const { id } = req.params;
        const { name, description, dueDate, status, priority, assigneeIds, contractDate, kickoffDate, estimatedTotalCost, sellingPrice, } = req.body;
        try {
            const user = req.user;
            // Only admins or super admins can update projects
            if (user.role !== "admin" && user.role !== "super_admin") {
                return res
                    .status(403)
                    .json({ message: "Not authorized to update projects" });
            }
            const existing = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: req.organization.id,
                },
                include: { assignees: { include: { user: true } } },
            });
            if (!existing) {
                return res.status(404).json({ message: "Project not found" });
            }
            const data = {};
            if (name)
                data.name = name;
            if (description !== undefined)
                data.description = description;
            // Only set when truthy — mirrors the pre-Prisma behavior of leaving the
            // column untouched (rather than nulling it) for a falsy dueDate.
            if (dueDate) {
                data.dueDate = new Date(dueDate);
            }
            if (status && Object.values(enums_1.TaskStatus).includes(status)) {
                data.status = status;
            }
            if (priority && Object.values(enums_1.TaskPriority).includes(priority)) {
                data.priority = priority;
            }
            let assignees = existing.assignees.map((a) => a.user);
            if (assigneeIds && Array.isArray(assigneeIds)) {
                assignees = await prisma_1.prisma.user.findMany({ where: { id: { in: assigneeIds } } });
                data.assignees = {
                    deleteMany: {},
                    create: assigneeIds.map((userId) => ({ userId })),
                };
            }
            if (contractDate !== undefined) {
                // null (not undefined) is required here so Prisma actually issues
                // `SET "contractDate" = NULL` — an omitted property leaves the old value in place.
                data.contractDate = contractDate ? new Date(contractDate) : null;
            }
            if (kickoffDate !== undefined) {
                data.kickoffDate = kickoffDate ? new Date(kickoffDate) : null;
            }
            if (estimatedTotalCost !== undefined) {
                data.estimatedTotalCost = estimatedTotalCost === null ? null : estimatedTotalCost;
            }
            if (sellingPrice !== undefined) {
                data.sellingPrice = sellingPrice === null ? null : sellingPrice;
            }
            const updatedRow = await prisma_1.prisma.project.update({ where: { id: existing.id }, data });
            const project = { ...updatedRow, assignees };
            return res.status(200).json({ message: "Project updated", project });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static deleteProject = async (req, res) => {
        const { id } = req.params;
        try {
            const user = req.user;
            // Only admins or super admins can delete projects
            if (user.role !== "admin" && user.role !== "super_admin") {
                return res
                    .status(403)
                    .json({ message: "Not authorized to delete projects" });
            }
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(id),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            await prisma_1.prisma.project.delete({ where: { id: project.id } });
            return res.status(200).json({ message: "Project deleted successfully" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.ProjectController = ProjectController;
//# sourceMappingURL=ProjectController.js.map