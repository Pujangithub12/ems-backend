"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubTaskController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const subtaskTree_1 = require("../utils/subtaskTree");
class SubTaskController {
    static addSubTask = async (req, res) => {
        const { taskId } = req.params;
        const { title, parentSubTaskId, estimatedDays } = req.body;
        if (!title)
            return res.status(400).json({ message: "Subtask title is required" });
        let parsedEstimatedDays;
        if (estimatedDays !== undefined && estimatedDays !== null && estimatedDays !== "") {
            const n = Number(estimatedDays);
            if (Number.isNaN(n) || n < 0) {
                return res.status(400).json({ message: "Estimated days must be a non-negative number" });
            }
            parsedEstimatedDays = n;
        }
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const userId = req.user?.id;
            const isAssigned = task.assignedUsers.some((a) => a.userId === userId);
            const isCreator = task.createdById === userId;
            if (!isAssigned &&
                !isCreator &&
                req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
                return res
                    .status(403)
                    .json({ message: "Forbidden: You are not assigned to this task." });
            }
            let parentId;
            if (parentSubTaskId) {
                const parentSubTask = await prisma_1.prisma.subTask.findUnique({
                    where: { id: parseInt(parentSubTaskId) },
                });
                if (!parentSubTask)
                    return res.status(404).json({ message: "Parent subtask not found" });
                parentId = parentSubTask.id;
            }
            const subTask = await prisma_1.prisma.subTask.create({
                data: {
                    title,
                    taskId: task.id,
                    ...(parsedEstimatedDays !== undefined ? { estimatedDays: parsedEstimatedDays } : {}),
                    ...(parentId !== undefined ? { parentId } : {}),
                },
            });
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(task.id);
            const tree = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            const avg = (0, subtaskTree_1.computeAverageLeafProgress)(tree);
            await prisma_1.prisma.task.update({ where: { id: task.id }, data: { progress: avg } });
            return res.status(201).json({
                message: "Subtask added",
                subTask,
                subTasks: tree,
                taskProgress: avg,
            });
        }
        catch (error) {
            console.error("Add SubTask Error:", error);
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static updateSubTask = async (req, res) => {
        const { taskId, subtaskId } = req.params;
        const { title: updateText, name, status, progress, estimatedDays } = req.body;
        console.log("=== updateSubTask called ===", {
            taskId,
            subtaskId,
            updateText,
            progress,
        });
        try {
            const subTask = await prisma_1.prisma.subTask.findUnique({
                where: { id: parseInt(subtaskId) },
            });
            if (!subTask || subTask.taskId !== parseInt(taskId)) {
                return res.status(404).json({ message: "Subtask not found" });
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            // Capture old progress for history
            const oldProgress = subTask.progress ?? 0;
            const data = {};
            // `name` renames the subtask itself; `title` above is a different
            // thing — the free-text note for this particular progress update,
            // logged into history/comments rather than persisted on the subtask.
            if (typeof name === "string") {
                const trimmedName = name.trim();
                if (!trimmedName) {
                    return res.status(400).json({ message: "Sub-task name cannot be empty" });
                }
                data.title = trimmedName;
            }
            if (status && Object.values(enums_1.TaskStatus).includes(status)) {
                data.status = status;
            }
            if (progress !== undefined) {
                data.progress = parseInt(progress);
            }
            if (estimatedDays !== undefined && estimatedDays !== null && estimatedDays !== "") {
                const n = Number(estimatedDays);
                if (Number.isNaN(n) || n < 0) {
                    return res.status(400).json({ message: "Estimated days must be a non-negative number" });
                }
                data.estimatedDays = n;
            }
            // Add current state to history with the update text
            const history = subTask.history ? JSON.parse(subTask.history) : [];
            history.unshift({
                id: Date.now().toString(),
                date: new Date().toISOString(),
                title: updateText || `Progress updated to ${progress}%`,
                progress: parseInt(progress) || oldProgress,
                authorId: user.id,
                authorName: user.fullName,
            });
            // Keep only the last 10 updates to prevent database bloat
            data.history = JSON.stringify(history.slice(0, 10));
            // Save the subtask
            const updated = await prisma_1.prisma.subTask.update({ where: { id: subTask.id }, data });
            // Create a SubTaskComment for this update so admin can give feedback
            if (updateText) {
                await prisma_1.prisma.subTaskComment.create({
                    data: {
                        commentText: updateText,
                        authorId: user.id,
                        subTaskId: subTask.id,
                    },
                });
            }
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(parseInt(taskId));
            const tree = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            const avg = (0, subtaskTree_1.computeAverageLeafProgress)(tree);
            await prisma_1.prisma.task.update({
                where: { id: parseInt(taskId) },
                data: { progress: avg },
            });
            return res.status(200).json({
                message: "Subtask updated",
                subTask: { ...updated, history: JSON.parse(updated.history || "[]") },
                subTasks: tree,
                taskProgress: avg,
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static deleteSubTask = async (req, res) => {
        const { taskId, subtaskId } = req.params;
        try {
            const subTask = await prisma_1.prisma.subTask.findUnique({
                where: { id: parseInt(subtaskId) },
            });
            if (!subTask || subTask.taskId !== parseInt(taskId)) {
                return res.status(404).json({ message: "Subtask not found" });
            }
            await prisma_1.prisma.subTask.delete({ where: { id: subTask.id } });
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(parseInt(taskId));
            const tree = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            const avg = (0, subtaskTree_1.computeAverageLeafProgress)(tree);
            await prisma_1.prisma.task.update({
                where: { id: parseInt(taskId) },
                data: { progress: avg },
            });
            return res.status(200).json({
                message: "Subtask deleted successfully",
                subTasks: tree,
                taskProgress: avg,
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static getSubTasks = async (req, res) => {
        const { taskId } = req.params;
        try {
            const task = await prisma_1.prisma.task.findUnique({
                where: { id: parseInt(taskId) },
                include: { assignedUsers: true },
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            if (req.user?.role !== enums_1.UserRole.SUPER_ADMIN) {
                // Only the assigner (creator) and the assignees may view a task's subtasks.
                const isAssigned = task.assignedUsers.some((a) => a.userId === req.user?.id);
                const isCreator = task.createdById === req.user?.id;
                if (!isAssigned && !isCreator)
                    return res.status(403).json({ message: "Forbidden" });
            }
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(parseInt(taskId));
            console.log("Raw subtasks from DB:", JSON.stringify(allSubTasks.map((st) => ({
                id: st.id,
                history: st.history,
                progress: st.progress,
            }))));
            const tree = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            return res.status(200).json(tree);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.SubTaskController = SubTaskController;
//# sourceMappingURL=SubTaskController.js.map