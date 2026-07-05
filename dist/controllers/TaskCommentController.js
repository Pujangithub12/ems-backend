"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskCommentController = void 0;
const data_source_1 = require("../config/data-source");
const Task_1 = require("../entities/Task");
const SubTask_1 = require("../entities/SubTask");
const TaskComment_1 = require("../entities/TaskComment");
const SubTaskComment_1 = require("../entities/SubTaskComment");
const User_1 = require("../entities/User");
/** Comments and admin feedback for both tasks and subtasks. */
class TaskCommentController {
    static addComment = async (req, res) => {
        const { taskId } = req.params;
        const { commentText } = req.body;
        if (!commentText)
            return res.status(400).json({ message: "Comment text is required" });
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const commentRepository = data_source_1.AppDataSource.getRepository(TaskComment_1.TaskComment);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const task = await taskRepository.findOne({
                where: { id: parseInt(taskId) },
                relations: ["assignedUsers"],
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const user = await userRepository.findOneBy({ id: req.user.id });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const isAssigned = task.assignedUsers.some((assigned) => assigned.id === user.id);
            if (!isAssigned &&
                req.user?.role !== "admin" &&
                req.user?.role !== "super_admin")
                return res.status(403).json({ message: "Forbidden" });
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
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
                const isAssigned = task.assignedUsers.some((assigned) => assigned.id === req.user?.id);
                if (!isAssigned)
                    return res.status(403).json({ message: "Forbidden" });
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
        if (!feedback)
            return res.status(400).json({ message: "Feedback is required" });
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
    static addSubTaskComment = async (req, res) => {
        console.log("=== addSubTaskComment CALLED ===");
        console.log("Params:", req.params);
        const { taskId, subtaskId } = req.params;
        const { commentText } = req.body;
        if (!commentText)
            return res.status(400).json({ message: "Comment text is required" });
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const commentRepository = data_source_1.AppDataSource.getRepository(SubTaskComment_1.SubTaskComment);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const task = await taskRepository.findOne({
                where: { id: parseInt(taskId) },
                relations: ["assignedUsers"],
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const subTask = await subTaskRepository.findOne({
                where: {
                    id: parseInt(subtaskId),
                    task: { id: parseInt(taskId) },
                },
            });
            if (!subTask)
                return res.status(404).json({ message: "Subtask not found" });
            const user = await userRepository.findOneBy({ id: req.user.id });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const isAssigned = task.assignedUsers.some((assigned) => assigned.id === user.id);
            if (!isAssigned &&
                req.user?.role !== "admin" &&
                req.user?.role !== "super_admin")
                return res.status(403).json({ message: "Forbidden" });
            const comment = commentRepository.create({
                commentText,
                author: user,
                subTask,
            });
            await commentRepository.save(comment);
            return res.status(201).json({ message: "Comment added", comment });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getSubTaskComments = async (req, res) => {
        console.log("=== getSubTaskComments CALLED ===");
        console.log("Params:", req.params);
        const { taskId, subtaskId } = req.params;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const commentRepository = data_source_1.AppDataSource.getRepository(SubTaskComment_1.SubTaskComment);
            const task = await taskRepository.findOne({
                where: { id: parseInt(taskId) },
                relations: ["assignedUsers"],
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const subTask = await subTaskRepository.findOne({
                where: {
                    id: parseInt(subtaskId),
                    task: { id: parseInt(taskId) },
                },
            });
            if (!subTask)
                return res.status(404).json({ message: "Subtask not found" });
            if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
                const isAssigned = task.assignedUsers.some((assigned) => assigned.id === req.user?.id);
                if (!isAssigned)
                    return res.status(403).json({ message: "Forbidden" });
            }
            const comments = await commentRepository.find({
                where: { subTask: { id: subTask.id } },
                relations: ["author"],
                order: { createdAt: "ASC" },
            });
            return res.status(200).json(comments);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static addSubTaskFeedback = async (req, res) => {
        const { taskId, subtaskId, commentId } = req.params;
        const { feedback } = req.body;
        if (!feedback)
            return res.status(400).json({ message: "Feedback is required" });
        try {
            const commentRepository = data_source_1.AppDataSource.getRepository(SubTaskComment_1.SubTaskComment);
            const comment = await commentRepository.findOne({
                where: { id: parseInt(commentId) },
                relations: ["subTask", "subTask.task", "subTask.task.assignedUsers"],
            });
            if (!comment ||
                comment.subTask.id !== parseInt(subtaskId) ||
                comment.subTask.task.id !== parseInt(taskId)) {
                return res.status(404).json({ message: "Comment not found" });
            }
            // Only allow admin/super_admin to add feedback
            if (req.user?.role !== "admin" && req.user?.role !== "super_admin")
                return res.status(403).json({ message: "Forbidden" });
            comment.feedback = feedback;
            await commentRepository.save(comment);
            return res.status(200).json({ message: "Feedback added", comment });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.TaskCommentController = TaskCommentController;
//# sourceMappingURL=TaskCommentController.js.map