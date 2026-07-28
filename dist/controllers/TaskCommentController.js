"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskCommentController = void 0;
const prisma_1 = require("../config/prisma");
// `author` was an eager relation on TaskComment/SubTaskComment under TypeORM
// (always populated regardless of the `relations` option), so every
// TypeORM `find`/`findOne` implicitly returned it too. Prisma has no eager
// relations — every place below that needs `.author` in the response now
// explicitly `include`s it (or attaches an already-loaded `user`) before
// this helper trims it down to the public fields.
const sanitizeAuthor = (comment) => {
    if (comment.author) {
        const { id, fullName, email } = comment.author;
        comment.author = { id, fullName, email };
    }
};
/** Comments and admin feedback for both tasks and subtasks. */
class TaskCommentController {
    static addComment = async (req, res) => {
        const { taskId } = req.params;
        const { commentText } = req.body;
        if (!commentText)
            return res.status(400).json({ message: "Comment text is required" });
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            // Only the assigner (creator) and the assignees may view/comment on a task.
            const isAssigned = task.assignedUsers.some((assigned) => assigned.userId === user.id);
            const isCreator = task.createdById === user.id;
            if (!isAssigned && !isCreator && req.user?.role !== "super_admin")
                return res.status(403).json({ message: "Forbidden" });
            const created = await prisma_1.prisma.taskComment.create({
                data: { commentText, authorId: user.id, taskId: task.id },
            });
            const comment = { ...created, author: user };
            sanitizeAuthor(comment);
            return res.status(201).json({ message: "Comment added", comment });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getTaskComments = async (req, res) => {
        const { taskId } = req.params;
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            // Only the assigner (creator) and the assignees may view a task's comments.
            if (req.user?.role !== "super_admin") {
                const isAssigned = task.assignedUsers.some((assigned) => assigned.userId === req.user?.id);
                const isCreator = task.createdById === req.user?.id;
                if (!isAssigned && !isCreator)
                    return res.status(403).json({ message: "Forbidden" });
            }
            const comments = await prisma_1.prisma.taskComment.findMany({
                where: { taskId: task.id },
                include: { author: true },
                orderBy: { createdAt: "asc" },
            });
            comments.forEach(sanitizeAuthor);
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
            const comment = await prisma_1.prisma.taskComment.findUnique({
                where: { id: parseInt(commentId) },
                include: { author: true },
            });
            if (!comment || comment.taskId !== parseInt(taskId)) {
                return res.status(404).json({ message: "Comment not found" });
            }
            const updated = await prisma_1.prisma.taskComment.update({
                where: { id: comment.id },
                data: { feedback },
            });
            const responseComment = { ...updated, author: comment.author };
            sanitizeAuthor(responseComment);
            return res
                .status(200)
                .json({ message: "Feedback added", comment: responseComment });
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
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const subTask = await prisma_1.prisma.subTask.findFirst({
                where: {
                    id: parseInt(subtaskId),
                    taskId: parseInt(taskId),
                },
            });
            if (!subTask)
                return res.status(404).json({ message: "Subtask not found" });
            const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const isAssigned = task.assignedUsers.some((assigned) => assigned.userId === user.id);
            // Writing a subtask update is the assignee's job — the assigner reviews
            // it and gives feedback instead (see addSubTaskFeedback below).
            if (!isAssigned && req.user?.role !== "super_admin")
                return res.status(403).json({ message: "Forbidden" });
            const created = await prisma_1.prisma.subTaskComment.create({
                data: { commentText, authorId: user.id, subTaskId: subTask.id },
            });
            const comment = { ...created, author: user };
            sanitizeAuthor(comment);
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
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const subTask = await prisma_1.prisma.subTask.findFirst({
                where: {
                    id: parseInt(subtaskId),
                    taskId: parseInt(taskId),
                },
            });
            if (!subTask)
                return res.status(404).json({ message: "Subtask not found" });
            // Viewable by the assignee (who wrote the update) and the assigner (who
            // reviews it and gives feedback), plus super_admin as a fallback.
            const isAssigned = task.assignedUsers.some((assigned) => assigned.userId === req.user?.id);
            const isAssigner = task.createdById === req.user?.id;
            if (!isAssigned && !isAssigner && req.user?.role !== "super_admin") {
                return res.status(403).json({ message: "Forbidden" });
            }
            const comments = await prisma_1.prisma.subTaskComment.findMany({
                where: { subTaskId: subTask.id },
                include: { author: true },
                orderBy: { createdAt: "asc" },
            });
            comments.forEach(sanitizeAuthor);
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
            const comment = await prisma_1.prisma.subTaskComment.findUnique({
                where: { id: parseInt(commentId) },
                include: {
                    author: true,
                    subTask: { include: { task: { include: { createdBy: true } } } },
                },
            });
            if (!comment ||
                comment.subTaskId !== parseInt(subtaskId) ||
                comment.subTask?.taskId !== parseInt(taskId)) {
                return res.status(404).json({ message: "Comment not found" });
            }
            // Only the person who assigned this task may give feedback on the
            // assignee's update — a super_admin can too, as a fallback in case the
            // original assigner's account was removed.
            const isAssigner = comment.subTask?.task?.createdById === req.user?.id;
            if (!isAssigner && req.user?.role !== "super_admin")
                return res.status(403).json({ message: "Forbidden" });
            const updated = await prisma_1.prisma.subTaskComment.update({
                where: { id: comment.id },
                data: { feedback },
            });
            const responseComment = { ...updated, author: comment.author };
            sanitizeAuthor(responseComment);
            return res
                .status(200)
                .json({ message: "Feedback added", comment: responseComment });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.TaskCommentController = TaskCommentController;
//# sourceMappingURL=TaskCommentController.js.map