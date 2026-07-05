"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectController = void 0;
const data_source_1 = require("../config/data-source");
const Project_1 = require("../entities/Project");
const User_1 = require("../entities/User");
const ProjectHeading_1 = require("../entities/ProjectHeading");
const Task_1 = require("../entities/Task");
const TaskEnums_1 = require("../entities/TaskEnums");
const typeorm_1 = require("typeorm");
class ProjectController {
    static createProject = async (req, res) => {
        const { name, description, dueDate, status, priority, assigneeIds } = req.body;
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
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            let assignees = [];
            if (assigneeIds && Array.isArray(assigneeIds) && assigneeIds.length > 0) {
                assignees = await userRepository.findBy({ id: (0, typeorm_1.In)(assigneeIds) });
            }
            const workspace = req.workspace;
            const projectPayload = {
                name,
                description,
                status: status && Object.values(TaskEnums_1.TaskStatus).includes(status)
                    ? status
                    : TaskEnums_1.TaskStatus.PENDING,
                priority: priority && Object.values(TaskEnums_1.TaskPriority).includes(priority)
                    ? priority
                    : TaskEnums_1.TaskPriority.MEDIUM,
                assignees,
                workspace,
            };
            if (dueDate) {
                projectPayload.dueDate = new Date(dueDate);
            }
            const project = projectRepository.create(projectPayload);
            await projectRepository.save(project);
            return res.status(201).json({ message: "Project created", project });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getAllProjects = async (req, res) => {
        try {
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const workspace = req.workspace; // Assert not undefined (set by middleware)
            const user = req.user;
            let projects;
            if (user.role === "admin" || user.role === "super_admin") {
                // Admin or super admin see all projects
                projects = await projectRepository.find({
                    where: { workspace: { id: workspace.id } },
                    relations: [
                        "assignees",
                        "files",
                        "headings",
                        "headings.tasks",
                        "headings.tasks.assignedUsers",
                        "headings.subHeadings",
                        "headings.subHeadings.tasks",
                        "headings.subHeadings.tasks.assignedUsers",
                        "projectTasks",
                        "projectTasks.assignedUsers",
                    ],
                    order: { createdAt: "DESC" },
                });
            }
            else {
                // Regular users only see projects they are assigned to
                projects = await projectRepository
                    .createQueryBuilder("project")
                    .leftJoinAndSelect("project.assignees", "assignee")
                    .leftJoinAndSelect("project.files", "file")
                    .leftJoinAndSelect("project.headings", "heading")
                    .leftJoinAndSelect("heading.tasks", "headingTask")
                    .leftJoinAndSelect("headingTask.assignedUsers", "headingTaskUser")
                    .leftJoinAndSelect("heading.subHeadings", "subHeading")
                    .leftJoinAndSelect("subHeading.tasks", "subHeadingTask")
                    .leftJoinAndSelect("subHeadingTask.assignedUsers", "subHeadingTaskUser")
                    .leftJoinAndSelect("project.projectTasks", "projectTask")
                    .leftJoinAndSelect("projectTask.assignedUsers", "projectTaskUser")
                    .where("project.workspaceId = :workspaceId", {
                    workspaceId: workspace.id,
                })
                    .andWhere("assignee.id = :userId", { userId: user.id })
                    .orderBy("project.createdAt", "DESC")
                    .getMany();
            }
            console.log("[ProjectController.getAllProjects] Projects count:", projects.length);
            return res.status(200).json(projects);
        }
        catch (error) {
            console.error("[ProjectController.getAllProjects] Error:", error);
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getProjectById = async (req, res) => {
        const { id } = req.params;
        const user = req.user;
        const workspace = req.workspace;
        try {
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            let project;
            if (user.role === "admin" || user.role === "super_admin") {
                project = await projectRepository.findOne({
                    where: {
                        id: parseInt(id),
                        workspace: { id: workspace.id },
                    },
                    relations: [
                        "assignees",
                        "files",
                        "headings",
                        "headings.tasks",
                        "headings.tasks.assignedUsers",
                        "headings.subHeadings",
                        "headings.subHeadings.tasks",
                        "headings.subHeadings.tasks.assignedUsers",
                        "projectTasks",
                        "projectTasks.assignedUsers",
                    ],
                });
            }
            else {
                // Check that the user is assigned to the project
                project = await projectRepository
                    .createQueryBuilder("project")
                    .leftJoinAndSelect("project.assignees", "assignee")
                    .leftJoinAndSelect("project.files", "file")
                    .leftJoinAndSelect("project.headings", "heading")
                    .leftJoinAndSelect("heading.tasks", "headingTask")
                    .leftJoinAndSelect("headingTask.assignedUsers", "headingTaskUser")
                    .leftJoinAndSelect("heading.subHeadings", "subHeading")
                    .leftJoinAndSelect("subHeading.tasks", "subHeadingTask")
                    .leftJoinAndSelect("subHeadingTask.assignedUsers", "subHeadingTaskUser")
                    .leftJoinAndSelect("project.projectTasks", "projectTask")
                    .leftJoinAndSelect("projectTask.assignedUsers", "projectTaskUser")
                    .where("project.id = :projectId", {
                    projectId: parseInt(id),
                })
                    .andWhere("project.workspaceId = :workspaceId", {
                    workspaceId: workspace.id,
                })
                    .andWhere("assignee.id = :userId", { userId: user.id })
                    .getOne();
            }
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            console.log("[ProjectController.getProjectById] Found project:", project?.id, project?.name);
            console.log("[ProjectController.getProjectById] projectTasks length:", project?.projectTasks?.length);
            console.log("[ProjectController.getProjectById] headings tasks:");
            project?.headings?.forEach((h) => {
                console.log(`  - Heading ${h.name}: ${h.tasks?.length} tasks`);
                h.subHeadings?.forEach((sh) => {
                    console.log(`    - Subheading ${sh.name}: ${sh.tasks?.length} tasks`);
                });
            });
            return res.status(200).json(project);
        }
        catch (error) {
            console.error("[ProjectController.getProjectById] Error:", error);
            return res.status(500).json({ message: "Internal server error", error });
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
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const headingRepository = data_source_1.AppDataSource.getRepository(ProjectHeading_1.ProjectHeading);
            const project = await projectRepository.findOne({
                where: {
                    id: parseInt(projectId),
                    workspace: { id: req.workspace.id },
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            let parentHeading;
            if (parentHeadingId) {
                parentHeading = await headingRepository.findOneBy({
                    id: parseInt(parentHeadingId),
                });
            }
            const headingData = {
                name,
                project,
            };
            if (parentHeading) {
                headingData.parentHeading = parentHeading;
            }
            const heading = headingRepository.create(headingData);
            await headingRepository.save(heading);
            return res.status(201).json({ message: "Heading added", heading });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
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
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const headingRepository = data_source_1.AppDataSource.getRepository(ProjectHeading_1.ProjectHeading);
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const project = await projectRepository.findOne({
                where: {
                    id: parseInt(projectId),
                    workspace: { id: req.workspace.id },
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            let heading;
            if (headingId) {
                heading = await headingRepository.findOneBy({
                    id: parseInt(headingId),
                });
            }
            let assignedUsers = [];
            if (assignedUserIds && Array.isArray(assignedUserIds)) {
                assignedUsers = await userRepository.findBy({
                    id: (0, typeorm_1.In)(assignedUserIds),
                });
            }
            const workspace = req.workspace;
            const taskData = {
                title,
                description,
                dueDate: new Date(dueDate),
                priority: priority || TaskEnums_1.TaskPriority.MEDIUM,
                project,
                assignedUsers,
                status: status || TaskEnums_1.TaskStatus.PENDING,
                progress: 0,
                workspace,
            };
            if (heading) {
                taskData.projectHeading = heading;
            }
            const task = taskRepository.create(taskData);
            await taskRepository.save(task);
            return res.status(201).json({ message: "Task added", task });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateProjectTask = async (req, res) => {
        const { taskId } = req.params;
        const { description, dueDate, progress, status, priority, title } = req.body;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const task = await taskRepository.findOneBy({
                id: parseInt(taskId),
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (title !== undefined)
                task.title = title;
            if (description !== undefined)
                task.description = description;
            if (dueDate !== undefined)
                task.dueDate = new Date(dueDate);
            if (progress !== undefined)
                task.progress = progress;
            if (status !== undefined)
                task.status = status;
            if (priority !== undefined)
                task.priority = priority;
            await taskRepository.save(task);
            return res.status(200).json({ message: "Task updated", task });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteProjectTask = async (req, res) => {
        const { taskId } = req.params;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const task = await taskRepository.findOneBy({
                id: parseInt(taskId),
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            await taskRepository.remove(task);
            return res.status(200).json({ message: "Task deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateProject = async (req, res) => {
        const { id } = req.params;
        const { name, description, dueDate, status, priority, assigneeIds } = req.body;
        try {
            const user = req.user;
            // Only admins or super admins can update projects
            if (user.role !== "admin" && user.role !== "super_admin") {
                return res
                    .status(403)
                    .json({ message: "Not authorized to update projects" });
            }
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const project = await projectRepository.findOne({
                where: {
                    id: parseInt(id),
                    workspace: { id: req.workspace.id },
                },
                relations: ["assignees"],
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            if (name)
                project.name = name;
            if (description !== undefined)
                project.description = description;
            if (dueDate !== undefined) {
                project.dueDate = dueDate
                    ? new Date(dueDate)
                    : undefined;
            }
            if (status && Object.values(TaskEnums_1.TaskStatus).includes(status)) {
                project.status = status;
            }
            if (priority && Object.values(TaskEnums_1.TaskPriority).includes(priority)) {
                project.priority = priority;
            }
            if (assigneeIds && Array.isArray(assigneeIds)) {
                project.assignees = await userRepository.findBy({
                    id: (0, typeorm_1.In)(assigneeIds),
                });
            }
            await projectRepository.save(project);
            return res.status(200).json({ message: "Project updated", project });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
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
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const project = await projectRepository.findOne({
                where: {
                    id: parseInt(id),
                    workspace: { id: req.workspace.id },
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            await projectRepository.remove(project);
            return res.status(200).json({ message: "Project deleted successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.ProjectController = ProjectController;
//# sourceMappingURL=ProjectController.js.map