import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Task } from "../entities/Task";
import { TaskPriority, TaskStatus } from "../entities/TaskEnums";
import { User } from "../entities/User";
import { Project } from "../entities/Project";
import { SubTask } from "../entities/SubTask";
import { TaskComment } from "../entities/TaskComment";
import { In } from "typeorm";
import { AuthRequest } from "../middlewares/auth";
import { ActivityController } from "./ActivityController";
import { ActivityType } from "../entities/Activity";

// Helper to build subtask tree from flat list (Bypasses TypeORM relation depth limits)
const buildSubTaskTree = (subTasks: any[]): any[] => {
  const map = new Map<string, any>();
  const roots: any[] = [];

  subTasks.forEach((st) => {
    map.set(String(st.id), { ...st, children: [] });
  });

  subTasks.forEach((st) => {
    const node = map.get(String(st.id));
    let parentId = null;

    if (st.parentId !== undefined && st.parentId !== null) {
      parentId = String(st.parentId);
    } else if (st.parent) {
      const pId = typeof st.parent === "object" ? st.parent.id : st.parent;
      if (pId !== null && pId !== undefined) parentId = String(pId);
    }

    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(node);
    } else if (!parentId) {
      roots.push(node);
    }
  });

  return roots;
};

// Helper to recursively save subtasks with optional parent
const saveSubTasks = async (
  parsedSubTasks: any[],
  parentTask: Task,
  subTaskRepository: any,
  parentSubTask?: SubTask,
): Promise<void> => {
  for (const subTaskData of parsedSubTasks) {
    if (!subTaskData.title) continue;
    const subTask = subTaskRepository.create({
      title: subTaskData.title,
      task: parentTask,
      ...(parentSubTask ? { parent: parentSubTask } : {}),
    });
    await subTaskRepository.save(subTask);
    if (
      Array.isArray(subTaskData.subTasks) &&
      subTaskData.subTasks.length > 0
    ) {
      await saveSubTasks(
        subTaskData.subTasks,
        parentTask,
        subTaskRepository,
        subTask,
      );
    }
  }
};

export class TaskController {
  static createTask = async (req: AuthRequest, res: Response) => {
    const {
      companyName,
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
    } = req.body;

    const files = req.files as Express.Multer.File[];

    if (!companyName || !title || !priority || !dueDate) {
      return res
        .status(400)
        .json({ message: "All fields except assignments are required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const taskRepository = AppDataSource.getRepository(Task);
      const projectRepository = AppDataSource.getRepository(Project);
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      let assignedUsers: User[] = [];
      let project: Project | null = null;

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

      if (assignAll === "true" || assignAll === true) {
        assignedUsers = await userRepository.find();
      } else if (parsedUserIds.length > 0) {
        assignedUsers = await userRepository.findBy({ id: In(parsedUserIds) });
      }

      if (projectId) {
        project = await projectRepository.findOneBy({
          id: parseInt(projectId as string),
        });
        if (!project)
          return res.status(404).json({ message: "Project not found" });
      }

      const filePaths = files ? files.map((file) => file.path) : [];

      const taskPayload: Partial<Task> = {
        companyName,
        title,
        description,
        priority: priority as TaskPriority,
        status: TaskStatus.PENDING,
        dueDate: new Date(dueDate),
        assignedUsers,
        files: filePaths,
        progress: progress ? parseInt(progress) : 0,
        projectName: projectName || null,
      };

      if (project) taskPayload.project = project;

      const newTask = taskRepository.create(taskPayload);
      await taskRepository.save(newTask);

      // Handle subTasks (supports nested)
      if (subTasks) {
        const parsedSubTasks =
          typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
        if (Array.isArray(parsedSubTasks)) {
          await saveSubTasks(parsedSubTasks, newTask, subTaskRepository);
        }
      }

      // Fetch all subtasks to return the complete tree with real DB IDs
      const allSubTasks = await subTaskRepository
        .createQueryBuilder("subTask")
        .leftJoinAndSelect("subTask.parent", "parent")
        .leftJoinAndSelect("subTask.task", "task")
        .where("task.id = :taskId", { taskId: newTask.id })
        .getMany();

      newTask.subTasks = buildSubTaskTree(allSubTasks);

      // Log activity for task creation
      await ActivityController.logActivity(
        ActivityType.TASK_CREATED,
        `Created task "${newTask.title}"`,
        newTask.id,
        req.user?.id,
      );

      if (assignedUsers.length > 0) {
        const assignedNames = assignedUsers.map((u) => u.fullName).join(", ");
        await ActivityController.logActivity(
          ActivityType.TASK_ASSIGNED,
          `Assigned task "${newTask.title}" to ${assignedNames}`,
          newTask.id,
          req.user?.id,
        );
      }

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
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      let tasks;

      if (req.user?.role === "admin") {
        tasks = await taskRepository.find({
          relations: ["assignedUsers", "project", "comments"],
          order: { createdAt: "DESC" },
        });
      } else {
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

        // FIXED: Using createQueryBuilder to ensure subtasks load for non-admins
        const allSubTasks = await subTaskRepository
          .createQueryBuilder("subTask")
          .leftJoinAndSelect("subTask.parent", "parent")
          .leftJoinAndSelect("subTask.task", "task")
          .where("task.id IN (:...taskIds)", { taskIds })
          .getMany();

        const subTasksByTask = new Map<number, any[]>();
        allSubTasks.forEach((st) => {
          const taskId = typeof st.task === "object" ? st.task.id : st.task;
          if (!subTasksByTask.has(taskId)) subTasksByTask.set(taskId, []);
          subTasksByTask.get(taskId)!.push(st);
        });

        tasks.forEach((task) => {
          task.subTasks = buildSubTaskTree(subTasksByTask.get(task.id) || []);
        });
      }

      return res.status(200).json(tasks);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTaskProgress = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { progress } = req.body;

    if (progress === undefined || progress === null) {
      return res.status(400).json({ message: "Progress is required" });
    }

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((user) => user.id === userId);

      // Only allow assigned users or admins to update progress
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTaskById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers", "project", "comments", "comments.author"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (req.user?.role !== "admin") {
        const assignedToUser = task.assignedUsers.some(
          (user) => user.id === req.user?.id,
        );
        if (!assignedToUser)
          return res.status(403).json({ message: "Forbidden" });
      }

      // FIXED: Using createQueryBuilder
      const allSubTasks = await subTaskRepository
        .createQueryBuilder("subTask")
        .leftJoinAndSelect("subTask.parent", "parent")
        .leftJoin("subTask.task", "task")
        .where("task.id = :taskId", { taskId: task.id })
        .getMany();

      task.subTasks = buildSubTaskTree(allSubTasks);

      return res.status(200).json(task);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTask = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      companyName,
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
    } = req.body;

    const files = req.files as Express.Multer.File[];

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const userRepository = AppDataSource.getRepository(User);
      const projectRepository = AppDataSource.getRepository(Project);
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers", "project"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const oldStatus = task.status;

      if (companyName) task.companyName = companyName;
      if (title) task.title = title;
      if (description !== undefined) task.description = description;
      if (priority) task.priority = priority as TaskPriority;
      if (status && Object.values(TaskStatus).includes(status as TaskStatus))
        task.status = status as TaskStatus;
      if (dueDate) task.dueDate = new Date(dueDate);
      if (progress !== undefined) task.progress = parseInt(progress);
      if (projectName !== undefined) task.projectName = projectName;

      if (projectId) {
        const project = await projectRepository.findOneBy({
          id: parseInt(projectId as string),
        });
        if (!project)
          return res.status(404).json({ message: "Project not found" });
        task.project = project;
      }

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

      let newAssignedUsers: User[] = [...task.assignedUsers];
      if (assignAll === "true" || assignAll === true) {
        newAssignedUsers = await userRepository.find();
        task.assignedUsers = newAssignedUsers;
      } else if (parsedUserIds.length > 0) {
        newAssignedUsers = await userRepository.findBy({
          id: In(parsedUserIds),
        });
        task.assignedUsers = newAssignedUsers;
      }

      if (files && files.length > 0) {
        const newFilePaths = files.map((file) => file.path);
        task.files = [...(task.files || []), ...newFilePaths];
      }

      // Handle subTasks (supports nested) — safely delete all existing then re-save
      if (subTasks) {
        const parsedSubTasks =
          typeof subTasks === "string" ? JSON.parse(subTasks) : subTasks;
        if (Array.isArray(parsedSubTasks)) {
          // 1. Fetch all existing subtasks for this task (FIXED: QueryBuilder)
          const existingSubTasks = await subTaskRepository
            .createQueryBuilder("subTask")
            .leftJoinAndSelect("subTask.parent", "parent")
            .leftJoin("subTask.task", "task")
            .where("task.id = :taskId", { taskId: task.id })
            .getMany();

          // 2. Safe deletion: Delete leaf nodes first to avoid Foreign Key violations
          let subTasksToDelete = [...existingSubTasks];
          while (subTasksToDelete.length > 0) {
            const leafNodes = subTasksToDelete.filter((st) => {
              const stId = st.id;
              const hasChildrenInList = subTasksToDelete.some((other) => {
                const otherParentId = other.parent
                  ? typeof other.parent === "object"
                    ? other.parent.id
                    : other.parent
                  : null;
                return otherParentId === stId;
              });
              return !hasChildrenInList;
            });

            if (leafNodes.length === 0) {
              await subTaskRepository.remove(subTasksToDelete);
              break;
            }

            await subTaskRepository.remove(leafNodes);
            subTasksToDelete = subTasksToDelete.filter(
              (st) => !leafNodes.includes(st),
            );
          }

          // 3. Save the new subtasks
          await saveSubTasks(parsedSubTasks, task, subTaskRepository);
        }
      }

      await taskRepository.save(task);

      // 4. Refetch task WITHOUT subTasks relations (we will build it manually)
      const updatedTask = await taskRepository.findOne({
        where: { id: task.id },
        relations: ["assignedUsers", "project", "comments", "comments.author"],
      });

      // 5. Fetch ALL subtasks and build the complete tree (FIXED: QueryBuilder)
      const allSubTasks = await subTaskRepository
        .createQueryBuilder("subTask")
        .leftJoinAndSelect("subTask.parent", "parent")
        .leftJoin("subTask.task", "task")
        .where("task.id = :taskId", { taskId: task.id })
        .getMany();

      if (updatedTask) {
        updatedTask.subTasks = buildSubTaskTree(allSubTasks);
      }

      // Log activity if status changed
      if (status && status !== oldStatus) {
        const statusLabel = (status as string).replace(/_/g, " ");
        await ActivityController.logActivity(
          ActivityType.STATUS_CHANGED,
          `Changed status of "${task.title}" to ${statusLabel}`,
          task.id,
          req.user?.id,
        );
      }

      // Log activity if assigned users changed
      if (
        (assignAll !== undefined && assignAll !== null) ||
        (userIds && parsedUserIds.length > 0)
      ) {
        const assignedNames = newAssignedUsers
          .map((u) => u.fullName)
          .join(", ");
        await ActivityController.logActivity(
          ActivityType.TASK_ASSIGNED,
          `Assigned task "${task.title}" to ${assignedNames}`,
          task.id,
          req.user?.id,
        );
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
    const { status } = req.body;

    if (!status) return res.status(400).json({ message: "Status is required" });

    const normalized = String(status).toLowerCase().replace(/\s+/g, "_");
    if (!Object.values(TaskStatus).includes(normalized as TaskStatus)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((user) => user.id === userId);
      if (!isAssigned && req.user?.role !== "admin")
        return res.status(403).json({ message: "Forbidden" });

      task.status = normalized as TaskStatus;
      await taskRepository.save(task);

      const statusLabel = normalized.replace(/_/g, " ");
      await ActivityController.logActivity(
        ActivityType.STATUS_CHANGED,
        `Changed status of "${task.title}" to ${statusLabel}`,
        task.id,
        userId,
      );

      return res.status(200).json({ message: "Task status updated", task });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTasksByProject = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const projectIdInt = parseInt(projectId as string);
      const projectTasks = await taskRepository.find({
        where: { project: { id: projectIdInt } },
        relations: ["assignedUsers", "project", "comments"],
        order: { createdAt: "DESC" },
      });

      let tasksToReturn = projectTasks;
      if (req.user?.role !== "admin") {
        tasksToReturn = projectTasks.filter((task) =>
          task.assignedUsers.some((user) => user.id === req.user?.id),
        );
      }

      if (tasksToReturn.length > 0) {
        const taskIds = tasksToReturn.map((t) => t.id);

        // FIXED: Using createQueryBuilder
        const allSubTasks = await subTaskRepository
          .createQueryBuilder("subTask")
          .leftJoinAndSelect("subTask.parent", "parent")
          .leftJoinAndSelect("subTask.task", "task")
          .where("task.id IN (:...taskIds)", { taskIds })
          .getMany();

        const subTasksByTask = new Map<number, any[]>();
        allSubTasks.forEach((st) => {
          const taskId = typeof st.task === "object" ? st.task.id : st.task;
          if (!subTasksByTask.has(taskId)) subTasksByTask.set(taskId, []);
          subTasksByTask.get(taskId)!.push(st);
        });

        tasksToReturn.forEach((task) => {
          task.subTasks = buildSubTaskTree(subTasksByTask.get(task.id) || []);
        });
      }

      return res.status(200).json(tasksToReturn);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addSubTask = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    const { title, parentSubTaskId } = req.body;

    if (!title)
      return res.status(400).json({ message: "Subtask title is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      // 1. Fetch task WITH assignedUsers to check permissions
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      // 2. Permission Check: Allow Admins OR Assigned Users
      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((user) => user.id === userId);

      if (!isAssigned && req.user?.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Forbidden: You are not assigned to this task." });
      }

      const subTaskPayload: Partial<SubTask> = { title, task };

      if (parentSubTaskId) {
        const parentSubTask = await subTaskRepository.findOneBy({
          id: parseInt(parentSubTaskId as string),
        });
        if (!parentSubTask)
          return res.status(404).json({ message: "Parent subtask not found" });
        subTaskPayload.parent = parentSubTask;
      }

      const subTask = subTaskRepository.create(subTaskPayload);
      await subTaskRepository.save(subTask);

      // 3. Fetch updated tree to send back to frontend
      const allSubTasks = await subTaskRepository
        .createQueryBuilder("subTask")
        .leftJoinAndSelect("subTask.parent", "parent")
        .leftJoin("subTask.task", "task")
        .where("task.id = :taskId", { taskId: task.id })
        .getMany();

      const tree = buildSubTaskTree(allSubTasks);

      return res
        .status(201)
        .json({ message: "Subtask added", subTask, subTasks: tree });
    } catch (error) {
      console.error("Add SubTask Error:", error);
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateSubTask = async (req: AuthRequest, res: Response) => {
    const { taskId, subtaskId } = req.params;
    const { title, status, progress } = req.body;

    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const subTask = await subTaskRepository.findOne({
        where: { id: parseInt(subtaskId as string) },
        relations: ["task"],
      });

      if (!subTask || subTask.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      // Capture old values for history
      const oldTitle = subTask.title;
      const oldProgress = subTask.progress;

      if (title) subTask.title = title;
      if (status && Object.values(TaskStatus).includes(status as TaskStatus)) {
        subTask.status = status as TaskStatus;
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

      await subTaskRepository.save(subTask);
      return res.status(200).json({ message: "Subtask updated", subTask });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteSubTask = async (req: Request, res: Response) => {
    const { taskId, subtaskId } = req.params;
    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const subTask = await subTaskRepository.findOne({
        where: { id: parseInt(subtaskId as string) },
        relations: ["task"],
      });

      if (!subTask || subTask.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      await subTaskRepository.remove(subTask);
      return res.status(200).json({ message: "Subtask deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getSubTasks = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);

      // FIXED: Using createQueryBuilder
      const allSubTasks = await subTaskRepository
        .createQueryBuilder("subTask")
        .leftJoinAndSelect("subTask.parent", "parent")
        .leftJoin("subTask.task", "task")
        .where("task.id = :taskId", { taskId: parseInt(taskId as string) })
        .orderBy("subTask.createdAt", "ASC")
        .getMany();

      const tree = buildSubTaskTree(allSubTasks);
      return res.status(200).json(tree);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addComment = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    const { commentText } = req.body;

    if (!commentText)
      return res.status(400).json({ message: "Comment text is required" });

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const commentRepository = AppDataSource.getRepository(TaskComment);
      const userRepository = AppDataSource.getRepository(User);
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) return res.status(404).json({ message: "User not found" });

      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.id === user.id,
      );
      if (!isAssigned && req.user?.role !== "admin")
        return res.status(403).json({ message: "Forbidden" });

      const comment = commentRepository.create({
        commentText,
        author: user,
        task,
      });
      await commentRepository.save(comment);

      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTaskComments = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      if (req.user?.role !== "admin") {
        const isAssigned = task.assignedUsers.some(
          (assigned) => assigned.id === req.user?.id,
        );
        if (!isAssigned) return res.status(403).json({ message: "Forbidden" });
      }

      const commentRepository = AppDataSource.getRepository(TaskComment);
      const comments = await commentRepository.find({
        where: { task: { id: task.id } },
        relations: ["author"],
        order: { createdAt: "ASC" },
      });

      return res.status(200).json(comments);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addFeedback = async (req: Request, res: Response) => {
    const { taskId, commentId } = req.params;
    const { feedback } = req.body;

    if (!feedback)
      return res.status(400).json({ message: "Feedback is required" });

    try {
      const commentRepository = AppDataSource.getRepository(TaskComment);
      const comment = await commentRepository.findOne({
        where: { id: parseInt(commentId as string) },
        relations: ["task"],
      });

      if (!comment || comment.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Comment not found" });
      }

      comment.feedback = feedback;
      await commentRepository.save(comment);

      return res.status(200).json({ message: "Feedback added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getDashboard = async (req: AuthRequest, res: Response) => {
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const isAdmin = req.user?.role === "admin";
      const userId = req.user?.id;

      if (isAdmin) {
        const total = await taskRepository.count();
        const pending = await taskRepository.count({
          where: { status: TaskStatus.PENDING },
        });
        const inProgress = await taskRepository.count({
          where: { status: TaskStatus.IN_PROGRESS },
        });
        const completed = await taskRepository.count({
          where: { status: TaskStatus.COMPLETED },
        });
        const highPriorityTasks = await taskRepository.find({
          where: { priority: TaskPriority.HIGH },
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
        .andWhere("task.status = :status", { status: TaskStatus.PENDING })
        .getCount();
      const inProgress = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.status = :status", { status: TaskStatus.IN_PROGRESS })
        .getCount();
      const completed = await taskRepository
        .createQueryBuilder("task")
        .leftJoin("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.status = :status", { status: TaskStatus.COMPLETED })
        .getCount();
      const highPriorityTasks = await taskRepository
        .createQueryBuilder("task")
        .leftJoinAndSelect("task.assignedUsers", "user")
        .where("user.id = :userId", { userId })
        .andWhere("task.priority = :priority", { priority: TaskPriority.HIGH })
        .orderBy("task.createdAt", "DESC")
        .getMany();

      return res
        .status(200)
        .json({ total, pending, inProgress, completed, highPriorityTasks });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
      });

      if (!task) return res.status(404).json({ message: "Task not found" });

      await taskRepository.remove(task);
      return res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
