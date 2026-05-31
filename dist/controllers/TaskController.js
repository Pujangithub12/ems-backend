"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskController = void 0;
const data_source_1 = require("../config/data-source");
const Task_1 = require("../entities/Task");
const TaskEnums_1 = require("../entities/TaskEnums");
const User_1 = require("../entities/User");
const Project_1 = require("../entities/Project");
const SubTask_1 = require("../entities/SubTask");
const TaskComment_1 = require("../entities/TaskComment");
const typeorm_1 = require("typeorm");
class TaskController {
    static createTask = async (req, res) => {
        const { companyName, title, description, priority, dueDate, userIds, assignAll, projectId, } = req.body;
        if (!companyName || !title || !description || !priority || !dueDate) {
            return res
                .status(400)
                .json({ message: "All fields except assignments are required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            let assignedUsers = [];
            let project = null;
            if (assignAll) {
                assignedUsers = await userRepository.find();
            }
            else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
                assignedUsers = await userRepository.findBy({ id: (0, typeorm_1.In)(userIds) });
            }
            if (projectId) {
                project = await projectRepository.findOneBy({
                    id: parseInt(projectId),
                });
                if (!project) {
                    return res.status(404).json({ message: "Project not found" });
                }
            }
            const taskPayload = {
                companyName,
                title,
                description,
                priority: priority,
                status: TaskEnums_1.TaskStatus.PENDING,
                dueDate: new Date(dueDate),
                assignedUsers,
            };
            if (project) {
                taskPayload.project = project;
            }
            const newTask = taskRepository.create(taskPayload);
            await taskRepository.save(newTask);
            return res.status(201).json({
                message: "Task created and assigned successfully",
                task: newTask,
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getAllTasks = async (req, res) => {
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            let tasks;
            if (req.user?.role === "admin") {
                tasks = await taskRepository.find({
                    relations: ["assignedUsers", "project", "subTasks", "comments"],
                    order: { createdAt: "DESC" },
                });
            }
            else {
                tasks = await taskRepository
                    .createQueryBuilder("task")
                    .leftJoinAndSelect("task.assignedUsers", "user")
                    .leftJoinAndSelect("task.project", "project")
                    .leftJoinAndSelect("task.subTasks", "subTask")
                    .leftJoinAndSelect("task.comments", "comment")
                    .where("user.id = :userId", { userId: req.user?.id })
                    .orderBy("task.createdAt", "DESC")
                    .getMany();
            }
            return res.status(200).json(tasks);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getTaskById = async (req, res) => {
        const { id } = req.params;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const task = await taskRepository.findOne({
                where: { id: parseInt(id) },
                relations: [
                    "assignedUsers",
                    "project",
                    "subTasks",
                    "comments",
                    "comments.author",
                ],
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (req.user?.role !== "admin") {
                const assignedToUser = task.assignedUsers.some((user) => user.id === req.user?.id);
                if (!assignedToUser) {
                    return res.status(403).json({ message: "Forbidden" });
                }
            }
            return res.status(200).json(task);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateTask = async (req, res) => {
        const { id } = req.params;
        const { companyName, title, description, priority, dueDate, status, userIds, assignAll, projectId, } = req.body;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const task = await taskRepository.findOne({
                where: { id: parseInt(id) },
                relations: ["assignedUsers", "project"],
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (companyName)
                task.companyName = companyName;
            if (title)
                task.title = title;
            if (description)
                task.description = description;
            if (priority)
                task.priority = priority;
            if (status && Object.values(TaskEnums_1.TaskStatus).includes(status)) {
                task.status = status;
            }
            if (dueDate)
                task.dueDate = new Date(dueDate);
            if (projectId) {
                const project = await projectRepository.findOneBy({
                    id: parseInt(projectId),
                });
                if (!project) {
                    return res.status(404).json({ message: "Project not found" });
                }
                task.project = project;
            }
            if (assignAll) {
                task.assignedUsers = await userRepository.find();
            }
            else if (userIds && Array.isArray(userIds)) {
                task.assignedUsers = await userRepository.findBy({ id: (0, typeorm_1.In)(userIds) });
            }
            await taskRepository.save(task);
            return res.status(200).json({
                message: "Task updated successfully",
                task,
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateTaskStatus = async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ message: "Status is required" });
        }
        const normalized = String(status).toLowerCase().replace(/\s+/g, "_");
        if (!Object.values(TaskEnums_1.TaskStatus).includes(normalized)) {
            return res.status(400).json({ message: "Invalid status value" });
        }
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const task = await taskRepository.findOne({
                where: { id: parseInt(id) },
                relations: ["assignedUsers"],
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            const userId = req.user?.id;
            const isAssigned = task.assignedUsers.some((user) => user.id === userId);
            if (!isAssigned && req.user?.role !== "admin") {
                return res.status(403).json({ message: "Forbidden" });
            }
            task.status = normalized;
            await taskRepository.save(task);
            return res.status(200).json({ message: "Task status updated", task });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getTasksByProject = async (req, res) => {
        const { projectId } = req.params;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const projectIdInt = parseInt(projectId);
            const projectTasks = await taskRepository.find({
                where: { project: { id: projectIdInt } },
                relations: ["assignedUsers", "project", "subTasks", "comments"],
                order: { createdAt: "DESC" },
            });
            if (req.user?.role !== "admin") {
                const filteredTasks = projectTasks.filter((task) => task.assignedUsers.some((user) => user.id === req.user?.id));
                return res.status(200).json(filteredTasks);
            }
            return res.status(200).json(projectTasks);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static addSubTask = async (req, res) => {
        const { taskId } = req.params;
        const { title } = req.body;
        if (!title) {
            return res.status(400).json({ message: "Subtask title is required" });
        }
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const task = await taskRepository.findOneBy({
                id: parseInt(taskId),
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            const subTask = subTaskRepository.create({
                title,
                task,
            });
            await subTaskRepository.save(subTask);
            return res.status(201).json({ message: "Subtask added", subTask });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateSubTask = async (req, res) => {
        const { taskId, subtaskId } = req.params;
        const { title, status } = req.body;
        try {
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const subTask = await subTaskRepository.findOne({
                where: { id: parseInt(subtaskId) },
                relations: ["task"],
            });
            if (!subTask || subTask.task.id !== parseInt(taskId)) {
                return res.status(404).json({ message: "Subtask not found" });
            }
            if (title)
                subTask.title = title;
            if (status && Object.values(TaskEnums_1.TaskStatus).includes(status)) {
                subTask.status = status;
            }
            await subTaskRepository.save(subTask);
            return res.status(200).json({ message: "Subtask updated", subTask });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static addComment = async (req, res) => {
        const { taskId } = req.params;
        const { commentText } = req.body;
        if (!commentText) {
            return res.status(400).json({ message: "Comment text is required" });
        }
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const commentRepository = data_source_1.AppDataSource.getRepository(TaskComment_1.TaskComment);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const task = await taskRepository.findOne({
                where: { id: parseInt(taskId) },
                relations: ["assignedUsers"],
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            const user = await userRepository.findOneBy({ id: req.user.id });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            const isAssigned = task.assignedUsers.some((assigned) => assigned.id === user.id);
            if (!isAssigned && req.user?.role !== "admin") {
                return res.status(403).json({ message: "Forbidden" });
            }
            const comment = commentRepository.create({
                commentText,
                author: user,
                task,
            });
            await commentRepository.save(comment);
            return res.status(201).json({ message: "Comment added", comment });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getTaskComments = async (req, res) => {
        const { taskId } = req.params;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const task = await taskRepository.findOne({
                where: { id: parseInt(taskId) },
                relations: ["assignedUsers"],
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            if (req.user?.role !== "admin") {
                const isAssigned = task.assignedUsers.some((assigned) => assigned.id === req.user?.id);
                if (!isAssigned) {
                    return res.status(403).json({ message: "Forbidden" });
                }
            }
            const commentRepository = data_source_1.AppDataSource.getRepository(TaskComment_1.TaskComment);
            const comments = await commentRepository.find({
                where: { task: { id: task.id } },
                relations: ["author"],
                order: { createdAt: "ASC" },
            });
            return res.status(200).json(comments);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static addFeedback = async (req, res) => {
        const { taskId, commentId } = req.params;
        const { feedback } = req.body;
        if (!feedback) {
            return res.status(400).json({ message: "Feedback is required" });
        }
        try {
            const commentRepository = data_source_1.AppDataSource.getRepository(TaskComment_1.TaskComment);
            const comment = await commentRepository.findOne({
                where: { id: parseInt(commentId) },
                relations: ["task"],
            });
            if (!comment || comment.task.id !== parseInt(taskId)) {
                return res.status(404).json({ message: "Comment not found" });
            }
            comment.feedback = feedback;
            await commentRepository.save(comment);
            return res.status(200).json({ message: "Feedback added", comment });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getDashboard = async (req, res) => {
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const isAdmin = req.user?.role === "admin";
            const userId = req.user?.id;
            if (isAdmin) {
                const total = await taskRepository.count();
                const pending = await taskRepository.count({
                    where: { status: TaskEnums_1.TaskStatus.PENDING },
                });
                const inProgress = await taskRepository.count({
                    where: { status: TaskEnums_1.TaskStatus.IN_PROGRESS },
                });
                const completed = await taskRepository.count({
                    where: { status: TaskEnums_1.TaskStatus.COMPLETED },
                });
                const highPriorityTasks = await taskRepository.find({
                    where: { priority: TaskEnums_1.TaskPriority.HIGH },
                    relations: ["assignedUsers"],
                    order: { createdAt: "DESC" },
                });
                return res.status(200).json({
                    total,
                    pending,
                    inProgress,
                    completed,
                    highPriorityTasks,
                });
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
                .andWhere("task.status = :status", { status: TaskEnums_1.TaskStatus.PENDING })
                .getCount();
            const inProgress = await taskRepository
                .createQueryBuilder("task")
                .leftJoin("task.assignedUsers", "user")
                .where("user.id = :userId", { userId })
                .andWhere("task.status = :status", { status: TaskEnums_1.TaskStatus.IN_PROGRESS })
                .getCount();
            const completed = await taskRepository
                .createQueryBuilder("task")
                .leftJoin("task.assignedUsers", "user")
                .where("user.id = :userId", { userId })
                .andWhere("task.status = :status", { status: TaskEnums_1.TaskStatus.COMPLETED })
                .getCount();
            const highPriorityTasks = await taskRepository
                .createQueryBuilder("task")
                .leftJoinAndSelect("task.assignedUsers", "user")
                .where("user.id = :userId", { userId })
                .andWhere("task.priority = :priority", { priority: TaskEnums_1.TaskPriority.HIGH })
                .orderBy("task.createdAt", "DESC")
                .getMany();
            return res.status(200).json({
                total,
                pending,
                inProgress,
                completed,
                highPriorityTasks,
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteTask = async (req, res) => {
        const { id } = req.params;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const task = await taskRepository.findOne({
                where: { id: parseInt(id) },
            });
            if (!task) {
                return res.status(404).json({ message: "Task not found" });
            }
            await taskRepository.remove(task);
            return res.status(200).json({ message: "Task deleted successfully" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.TaskController = TaskController;
//# sourceMappingURL=TaskController.js.map