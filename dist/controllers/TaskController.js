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
const SubTaskComment_1 = require("../entities/SubTaskComment");
const typeorm_1 = require("typeorm");
const ActivityController_1 = require("./ActivityController");
const Activity_1 = require("../entities/Activity");
const emailService_1 = require("../utils/emailService");
// Helper to build subtask tree from flat list (Bypasses TypeORM relation depth limits)
const buildSubTaskTree = (subTasks) => {
    const map = new Map();
    const roots = [];
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
        }
        else if (st.parent) {
            const pId = typeof st.parent === "object" ? st.parent.id : st.parent;
            if (pId !== null && pId !== undefined)
                parentId = String(pId);
        }
        if (parentId && map.has(parentId)) {
            map.get(parentId).children.push(node);
        }
        else if (!parentId) {
            roots.push(node);
        }
    });
    return roots;
};
// Helper to consistently fetch all subtasks for a task with all required fields
const fetchSubTasksForTask = async (taskId) => {
    const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
    return await subTaskRepository.find({
        where: { task: { id: taskId } },
        relations: ["parent"],
        order: { createdAt: "ASC" },
    });
};
const computeAverageLeafProgress = (tree) => {
    let sum = 0;
    let count = 0;
    const visit = (nodes) => {
        for (const n of nodes || []) {
            const children = n.children || [];
            if (children.length > 0) {
                visit(children);
            }
            else {
                const v = typeof n.progress === "number"
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
const saveSubTasks = async (parsedSubTasks, parentTask, subTaskRepository, parentSubTask) => {
    for (const subTaskData of parsedSubTasks) {
        if (!subTaskData.title)
            continue;
        const subTask = subTaskRepository.create({
            title: subTaskData.title,
            task: parentTask,
            ...(parentSubTask ? { parent: parentSubTask } : {}),
        });
        await subTaskRepository.save(subTask);
        if (Array.isArray(subTaskData.subTasks) &&
            subTaskData.subTasks.length > 0) {
            await saveSubTasks(subTaskData.subTasks, parentTask, subTaskRepository, subTask);
        }
    }
};
class TaskController {
    static createTask = async (req, res) => {
        const { companyName, title, description, priority, dueDate, userIds, assignAll, projectId, progress, subTasks, projectName, } = req.body;
        const files = req.files;
        if (!companyName || !title || !priority || !dueDate) {
            return res
                .status(400)
                .json({ message: "All fields except assignments are required" });
        }
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
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
            if (assignAll === "true" || assignAll === true) {
                assignedUsers = await userRepository.find();
            }
            else if (parsedUserIds.length > 0) {
                assignedUsers = await userRepository.findBy({ id: (0, typeorm_1.In)(parsedUserIds) });
            }
            if (projectId) {
                project = await projectRepository.findOneBy({
                    id: parseInt(projectId),
                });
                if (!project)
                    return res.status(404).json({ message: "Project not found" });
            }
            const filePaths = files ? files.map((file) => file.path) : [];
            const taskPayload = {
                companyName,
                title,
                description,
                priority: priority,
                status: TaskEnums_1.TaskStatus.PENDING,
                dueDate: new Date(dueDate),
                assignedUsers,
                files: filePaths,
                progress: progress ? parseInt(progress) : 0,
                projectName: projectName || null,
            };
            if (project)
                taskPayload.project = project;
            const newTask = taskRepository.create(taskPayload);
            await taskRepository.save(newTask);
            // Send email notifications to assigned users
            console.log("[Task Create] Checking assigned users:", assignedUsers.length);
            if (assignedUsers.length > 0) {
                const recipientEmails = assignedUsers
                    .map((u) => u.email)
                    .filter((email) => email);
                console.log("[Task Create] Recipient emails:", recipientEmails);
                console.log("[Task Create] RESEND_API_KEY present?", !!process.env.RESEND_API_KEY);
                console.log("[Task Create] RESEND_FROM_EMAIL:", process.env.RESEND_FROM_EMAIL);
                const emailSubject = `New Task Assigned: ${title}`;
                const emailText = `
Hello,

You have been assigned a new task!

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
                console.log("[Task Create] Calling sendEmail...");
                (0, emailService_1.sendEmail)(recipientEmails, emailSubject, emailText)
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
            await ActivityController_1.ActivityController.logActivity(Activity_1.ActivityType.TASK_CREATED, `Created task "${newTask.title}"`, newTask.id, req.user?.id);
            if (assignedUsers.length > 0) {
                const assignedNames = assignedUsers.map((u) => u.fullName).join(", ");
                await ActivityController_1.ActivityController.logActivity(Activity_1.ActivityType.TASK_ASSIGNED, `Assigned task "${newTask.title}" to ${assignedNames}`, newTask.id, req.user?.id);
            }
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
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            let tasks;
            if (req.user?.role === "admin") {
                tasks = await taskRepository.find({
                    relations: ["assignedUsers", "project", "comments"],
                    order: { createdAt: "DESC" },
                });
            }
            else {
                tasks = await taskRepository
                    .createQueryBuilder("task")
                    .leftJoinAndSelect("task.assignedUsers", "user")
                    .leftJoinAndSelect("task.project", "project")
                    .leftJoinAndSelect("task.comments", "comment")
                    .where("user.id = :userId", { userId: req.user?.id })
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
                const subTasksByTask = new Map();
                allSubTasks.forEach((st) => {
                    const taskId = typeof st.task === "object" ? st.task.id : st.task;
                    if (!subTasksByTask.has(taskId))
                        subTasksByTask.set(taskId, []);
                    subTasksByTask.get(taskId).push(st);
                });
                tasks.forEach((task) => {
                    task.subTasks = buildSubTaskTree(subTasksByTask.get(task.id) || []);
                    task.progress = computeAverageLeafProgress(task.subTasks);
                });
            }
            return res.status(200).json(tasks);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateTaskProgress = async (req, res) => {
        const { id } = req.params;
        const { progress } = req.body;
        if (progress === undefined || progress === null) {
            return res.status(400).json({ message: "Progress is required" });
        }
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const task = await taskRepository.findOne({
                where: { id: parseInt(id) },
                relations: ["assignedUsers"],
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const userId = req.user?.id;
            const isAssigned = task.assignedUsers.some((user) => user.id === userId);
            if (!isAssigned && req.user?.role !== "admin") {
                return res
                    .status(403)
                    .json({ message: "Forbidden: You are not assigned to this task." });
            }
            task.progress = parseInt(progress);
            await taskRepository.save(task);
            return res
                .status(200)
                .json({ message: "Task progress updated successfully", task });
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
                relations: ["assignedUsers", "project", "comments", "comments.author"],
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            if (req.user?.role !== "admin") {
                const assignedToUser = task.assignedUsers.some((user) => user.id === req.user?.id);
                if (!assignedToUser)
                    return res.status(403).json({ message: "Forbidden" });
            }
            const allSubTasks = await fetchSubTasksForTask(task.id);
            task.subTasks = buildSubTaskTree(allSubTasks);
            task.progress = computeAverageLeafProgress(task.subTasks);
            return res.status(200).json(task);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateTask = async (req, res) => {
        const { id } = req.params;
        const { companyName, title, description, priority, dueDate, status, userIds, assignAll, projectId, progress, subTasks, projectName, } = req.body;
        const files = req.files;
        try {
            const taskRepository = data_source_1.AppDataSource.getRepository(Task_1.Task);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const task = await taskRepository.findOne({
                where: { id: parseInt(id) },
                relations: ["assignedUsers", "project"],
            });
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const oldStatus = task.status;
            if (companyName)
                task.companyName = companyName;
            if (title)
                task.title = title;
            if (description !== undefined)
                task.description = description;
            if (priority)
                task.priority = priority;
            if (status && Object.values(TaskEnums_1.TaskStatus).includes(status))
                task.status = status;
            if (dueDate)
                task.dueDate = new Date(dueDate);
            if (progress !== undefined)
                task.progress = parseInt(progress);
            if (projectName !== undefined)
                task.projectName = projectName;
            if (projectId) {
                const project = await projectRepository.findOneBy({
                    id: parseInt(projectId),
                });
                if (!project)
                    return res.status(404).json({ message: "Project not found" });
                task.project = project;
            }
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
            let newAssignedUsers = [...task.assignedUsers];
            if (assignAll === "true" || assignAll === true) {
                newAssignedUsers = await userRepository.find();
                task.assignedUsers = newAssignedUsers;
            }
            else if (parsedUserIds.length > 0) {
                newAssignedUsers = await userRepository.findBy({
                    id: (0, typeorm_1.In)(parsedUserIds),
                });
                task.assignedUsers = newAssignedUsers;
            }
            if (files && files.length > 0) {
                const newFilePaths = files.map((file) => file.path);
                task.files = [...(task.files || []), ...newFilePaths];
            }
            // Handle subTasks (supports nested) — UPDATE existing ones to preserve history/progress
            if (subTasks) {
                const parsedSubTasks = typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
                if (Array.isArray(parsedSubTasks)) {
                    // 1. Fetch all existing subtasks for this task
                    const existingSubTasks = await fetchSubTasksForTask(task.id);
                    const existingSubTasksMap = new Map();
                    existingSubTasks.forEach((st) => existingSubTasksMap.set(String(st.id), st));
                    // 2. Helper to update or create subtasks recursively
                    const updateOrCreateSubTasks = async (subTasksList, parentSubTask) => {
                        for (const subTaskData of subTasksList) {
                            if (!subTaskData.title)
                                continue;
                            const subTaskIdStr = String(subTaskData.id);
                            let subTask;
                            if (existingSubTasksMap.has(subTaskIdStr) &&
                                !subTaskIdStr.startsWith("temp-")) {
                                // Update existing subtask (preserve history, progress!)
                                subTask = existingSubTasksMap.get(subTaskIdStr);
                                subTask.title = subTaskData.title;
                                if (parentSubTask)
                                    subTask.parent = parentSubTask;
                                await subTaskRepository.save(subTask);
                                existingSubTasksMap.delete(subTaskIdStr); // Mark as processed
                            }
                            else {
                                // Create new subtask
                                subTask = subTaskRepository.create({
                                    title: subTaskData.title,
                                    task,
                                    ...(parentSubTask ? { parent: parentSubTask } : {}),
                                });
                                await subTaskRepository.save(subTask);
                            }
                            // Process children
                            if (Array.isArray(subTaskData.subTasks) &&
                                subTaskData.subTasks.length > 0) {
                                await updateOrCreateSubTasks(subTaskData.subTasks, subTask);
                            }
                        }
                    };
                    // 3. Process the parsed subtasks
                    await updateOrCreateSubTasks(parsedSubTasks);
                    // 4. Delete remaining (unprocessed) existing subtasks
                    const subtasksToDelete = Array.from(existingSubTasksMap.values());
                    // Delete leaf nodes first
                    const deleteLeafNodes = async (toDelete) => {
                        if (toDelete.length === 0)
                            return;
                        const leafNodes = toDelete.filter((st) => {
                            const hasChildren = toDelete.some((other) => other.parent?.id === st.id);
                            return !hasChildren;
                        });
                        if (leafNodes.length > 0) {
                            await subTaskRepository.remove(leafNodes);
                            await deleteLeafNodes(toDelete.filter((st) => !leafNodes.includes(st)));
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
                const statusLabel = status.replace(/_/g, " ");
                await ActivityController_1.ActivityController.logActivity(Activity_1.ActivityType.STATUS_CHANGED, `Changed status of "${task.title}" to ${statusLabel}`, task.id, req.user?.id);
            }
            // Log activity if assigned users changed
            if ((assignAll !== undefined && assignAll !== null) ||
                (userIds && parsedUserIds.length > 0)) {
                const assignedNames = newAssignedUsers
                    .map((u) => u.fullName)
                    .join(", ");
                await ActivityController_1.ActivityController.logActivity(Activity_1.ActivityType.TASK_ASSIGNED, `Assigned task "${task.title}" to ${assignedNames}`, task.id, req.user?.id);
            }
            return res
                .status(200)
                .json({ message: "Task updated successfully", task: updatedTask });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateTaskStatus = async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        if (!status)
            return res.status(400).json({ message: "Status is required" });
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
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            const userId = req.user?.id;
            const isAssigned = task.assignedUsers.some((user) => user.id === userId);
            if (!isAssigned && req.user?.role !== "admin")
                return res.status(403).json({ message: "Forbidden" });
            task.status = normalized;
            await taskRepository.save(task);
            const statusLabel = normalized.replace(/_/g, " ");
            await ActivityController_1.ActivityController.logActivity(Activity_1.ActivityType.STATUS_CHANGED, `Changed status of "${task.title}" to ${statusLabel}`, task.id, userId);
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
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const projectIdInt = parseInt(projectId);
            const projectTasks = await taskRepository.find({
                where: { project: { id: projectIdInt } },
                relations: ["assignedUsers", "project", "comments"],
                order: { createdAt: "DESC" },
            });
            let tasksToReturn = projectTasks;
            if (req.user?.role !== "admin") {
                tasksToReturn = projectTasks.filter((task) => task.assignedUsers.some((user) => user.id === req.user?.id));
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
                const subTasksByTask = new Map();
                allSubTasks.forEach((st) => {
                    const taskId = typeof st.task === "object" ? st.task.id : st.task;
                    if (!subTasksByTask.has(taskId))
                        subTasksByTask.set(taskId, []);
                    subTasksByTask.get(taskId).push(st);
                });
                tasksToReturn.forEach((task) => {
                    task.subTasks = buildSubTaskTree(subTasksByTask.get(task.id) || []);
                });
            }
            return res.status(200).json(tasksToReturn);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
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
            if (!isAssigned && req.user?.role !== "admin") {
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
        }
        catch (error) {
            console.error("Add SubTask Error:", error);
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    static updateSubTask = async (req, res) => {
        const { taskId, subtaskId } = req.params;
        const { title, status, progress } = req.body;
        console.log("=== updateSubTask called ===", {
            taskId,
            subtaskId,
            title,
            progress,
        });
        try {
            const subTaskRepository = data_source_1.AppDataSource.getRepository(SubTask_1.SubTask);
            const subTask = await subTaskRepository.findOne({
                where: { id: parseInt(subtaskId) },
                relations: ["task"],
            });
            if (!subTask || subTask.task.id !== parseInt(taskId)) {
                return res.status(404).json({ message: "Subtask not found" });
            }
            // Capture old values for history
            const oldTitle = subTask.title;
            const oldProgress = subTask.progress ?? 0;
            if (title)
                subTask.title = title;
            if (status && Object.values(TaskEnums_1.TaskStatus).includes(status)) {
                subTask.status = status;
            }
            if (progress !== undefined) {
                subTask.progress = parseInt(progress);
            }
            // Add current state to history before overwriting
            const history = subTask.history || [];
            history.unshift({
                id: Date.now().toString(),
                date: new Date().toISOString(),
                title: oldTitle,
                progress: oldProgress,
            });
            // Keep only the last 5 updates to prevent database bloat
            subTask.history = history.slice(0, 5);
            console.log("Saving subtask history:", JSON.stringify(subTask.history));
            await subTaskRepository.save(subTask);
            const allSubTasks = await fetchSubTasksForTask(parseInt(taskId));
            const tree = buildSubTaskTree(allSubTasks);
            const avg = computeAverageLeafProgress(tree);
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
            const allSubTasks = await fetchSubTasksForTask(parseInt(taskId));
            const tree = buildSubTaskTree(allSubTasks);
            const avg = computeAverageLeafProgress(tree);
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
            const allSubTasks = await fetchSubTasksForTask(parseInt(taskId));
            console.log("Raw subtasks from DB:", JSON.stringify(allSubTasks.map((st) => ({
                id: st.id,
                history: st.history,
                progress: st.progress,
            }))));
            const tree = buildSubTaskTree(allSubTasks);
            return res.status(200).json(tree);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
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
            if (!isAssigned && req.user?.role !== "admin")
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
            if (req.user?.role !== "admin") {
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
            return res
                .status(200)
                .json({ total, pending, inProgress, completed, highPriorityTasks });
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
            if (!task)
                return res.status(404).json({ message: "Task not found" });
            await taskRepository.remove(task);
            return res.status(200).json({ message: "Task deleted successfully" });
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
            if (!isAssigned && req.user?.role !== "admin")
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
            if (req.user?.role !== "admin") {
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
            const isAssigned = comment.subTask.task.assignedUsers.some((assigned) => assigned.id === req.user?.id);
            if (!isAssigned && req.user?.role !== "admin")
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
exports.TaskController = TaskController;
//# sourceMappingURL=TaskController.js.map