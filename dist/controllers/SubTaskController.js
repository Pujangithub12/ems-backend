"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubTaskController = void 0;
const data_source_1 = require("../config/data-source");
const Task_1 = require("../entities/Task");
const TaskEnums_1 = require("../entities/TaskEnums");
const User_1 = require("../entities/User");
const SubTask_1 = require("../entities/SubTask");
const SubTaskComment_1 = require("../entities/SubTaskComment");
const subtaskTree_1 = require("../utils/subtaskTree");
class SubTaskController {
    static addSubTask = async (req, res) => {
        const { taskId } = req.params;
        const { title, parentSubTaskId } = req.body;
        if (!title)
            return res.status(400).json({ message: "Subtask title is required" });
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const task = await taskRepository.findOne({
                where: { id: parseInt(taskId) },
                relations: ["assignedUsers"],
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const userId = req.user?.id;
            const isAssigned = task.assignedUsers.some((user) => user.id === userId);
            if (!isAssigned &&
                req.user?.role !== TaskEnums_1.UserRole.ADMIN &&
                req.user?.role !== TaskEnums_1.UserRole.SUPER_ADMIN) {
                return res
                    .status(403)
                    .json({ message: "Forbidden: You are not assigned to this task." });
            }
            const subTaskPayload = { title, task };
            if (parentSubTaskId) {
                const parentSubTask = await subTaskRepository.findOneBy({
                    id: parseInt(parentSubTaskId),
                });
                if (!parentSubTask)
                    return res.status(404).json({ message: "Parent subtask not found" });
                subTaskPayload.parent = parentSubTask;
            }
            const subTask = subTaskRepository.create(subTaskPayload);
            await subTaskRepository.save(subTask);
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(task.id);
            const tree = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            const avg = (0, subtaskTree_1.computeAverageLeafProgress)(tree);
            await taskRepository.update(task.id, { progress: avg });
            return res.status(201).json({
                message: "Subtask added",
                subTask,
                subTasks: tree,
                taskProgress: avg,
            });
        }
        catch (error) {
            console.error("Add SubTask Error:", error);
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateSubTask = async (req, res) => {
        const { taskId, subtaskId } = req.params;
        const { title: updateText, status, progress } = req.body;
        console.log("=== updateSubTask called ===", {
            taskId,
            subtaskId,
            updateText,
            progress,
        });
        try {
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const subTaskCommentRepository = data_source_1.AppDataSource.getRepository(SubTaskComment_1.SubTaskComment);
            const subTask = await subTaskRepository.findOne({
                where: { id: parseInt(subtaskId) },
                relations: ["task"],
            });
            if (!subTask || subTask.task.id !== parseInt(taskId)) {
                return res.status(404).json({ message: "Subtask not found" });
            }
            const user = await userRepository.findOneBy({ id: req.user.id });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            // Capture old progress for history
            const oldProgress = subTask.progress ?? 0;
            // Only update status and progress, NOT the original title
            if (status && Object.values(TaskEnums_1.TaskStatus).includes(status)) {
                subTask.status = status;
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
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(parseInt(taskId));
            const tree = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            const avg = (0, subtaskTree_1.computeAverageLeafProgress)(tree);
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            await taskRepository.update(parseInt(taskId), {
                progress: avg,
            });
            return res.status(200).json({
                message: "Subtask updated",
                subTask,
                subTasks: tree,
                taskProgress: avg,
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static deleteSubTask = async (req, res) => {
        const { taskId, subtaskId } = req.params;
        try {
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const subTask = await subTaskRepository.findOne({
                where: { id: parseInt(subtaskId) },
                relations: ["task"],
            });
            if (!subTask || subTask.task.id !== parseInt(taskId)) {
                return res.status(404).json({ message: "Subtask not found" });
            }
            await subTaskRepository.remove(subTask);
            const allSubTasks = await (0, subtaskTree_1.fetchSubTasksForTask)(parseInt(taskId));
            const tree = (0, subtaskTree_1.buildSubTaskTree)(allSubTasks);
            const avg = (0, subtaskTree_1.computeAverageLeafProgress)(tree);
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            await taskRepository.update(parseInt(taskId), {
                progress: avg,
            });
            return res.status(200).json({
                message: "Subtask deleted successfully",
                subTasks: tree,
                taskProgress: avg,
            });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static getSubTasks = async (req, res) => {
        const { taskId } = req.params;
        try {
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
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.SubTaskController = SubTaskController;
//# sourceMappingURL=SubTaskController.js.map