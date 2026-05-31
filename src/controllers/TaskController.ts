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

export class TaskController {
  static createTask = async (req: Request, res: Response) => {
    const {
      companyName,
      title,
      description,
      priority,
      dueDate,
      userIds,
      assignAll,
      projectId,
    } = req.body;

    if (!companyName || !title || !description || !priority || !dueDate) {
      return res
        .status(400)
        .json({ message: "All fields except assignments are required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const taskRepository = AppDataSource.getRepository(Task);
      const projectRepository = AppDataSource.getRepository(Project);

      let assignedUsers: User[] = [];
      let project: Project | null = null;

      if (assignAll) {
        assignedUsers = await userRepository.find();
      } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
        assignedUsers = await userRepository.findBy({ id: In(userIds) });
      }

      if (projectId) {
        project = await projectRepository.findOneBy({
          id: parseInt(projectId as string),
        });
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }

      const taskPayload: Partial<Task> = {
        companyName,
        title,
        description,
        priority: priority as TaskPriority,
        status: TaskStatus.PENDING,
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getAllTasks = async (req: AuthRequest, res: Response) => {
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      let tasks;
      if (req.user?.role === "admin") {
        tasks = await taskRepository.find({
          relations: ["assignedUsers", "project", "subTasks", "comments"],
          order: { createdAt: "DESC" },
        });
      } else {
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTaskById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
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
        const assignedToUser = task.assignedUsers.some(
          (user) => user.id === req.user?.id,
        );
        if (!assignedToUser) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      return res.status(200).json(task);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTask = async (req: Request, res: Response) => {
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
    } = req.body;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const userRepository = AppDataSource.getRepository(User);
      const projectRepository = AppDataSource.getRepository(Project);
      const task = await taskRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignedUsers", "project"],
      });

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (companyName) task.companyName = companyName;
      if (title) task.title = title;
      if (description) task.description = description;
      if (priority) task.priority = priority as TaskPriority;
      if (status && Object.values(TaskStatus).includes(status as TaskStatus)) {
        task.status = status as TaskStatus;
      }
      if (dueDate) task.dueDate = new Date(dueDate);

      if (projectId) {
        const project = await projectRepository.findOneBy({
          id: parseInt(projectId as string),
        });
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
        task.project = project;
      }

      if (assignAll) {
        task.assignedUsers = await userRepository.find();
      } else if (userIds && Array.isArray(userIds)) {
        task.assignedUsers = await userRepository.findBy({ id: In(userIds) });
      }

      await taskRepository.save(task);

      return res.status(200).json({
        message: "Task updated successfully",
        task,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateTaskStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

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

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const userId = req.user?.id;
      const isAssigned = task.assignedUsers.some((user) => user.id === userId);
      if (!isAssigned && req.user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      task.status = normalized as TaskStatus;
      await taskRepository.save(task);

      return res.status(200).json({ message: "Task status updated", task });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getTasksByProject = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const projectIdInt = parseInt(projectId as string);
      const projectTasks = await taskRepository.find({
        where: { project: { id: projectIdInt } },
        relations: ["assignedUsers", "project", "subTasks", "comments"],
        order: { createdAt: "DESC" },
      });

      if (req.user?.role !== "admin") {
        const filteredTasks = projectTasks.filter((task) =>
          task.assignedUsers.some((user) => user.id === req.user?.id),
        );
        return res.status(200).json(filteredTasks);
      }

      return res.status(200).json(projectTasks);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addSubTask = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Subtask title is required" });
    }

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const task = await taskRepository.findOneBy({
        id: parseInt(taskId as string),
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateSubTask = async (req: Request, res: Response) => {
    const { taskId, subtaskId } = req.params;
    const { title, status } = req.body;

    try {
      const subTaskRepository = AppDataSource.getRepository(SubTask);
      const subTask = await subTaskRepository.findOne({
        where: { id: parseInt(subtaskId as string) },
        relations: ["task"],
      });

      if (!subTask || subTask.task.id !== parseInt(taskId as string)) {
        return res.status(404).json({ message: "Subtask not found" });
      }

      if (title) subTask.title = title;
      if (status && Object.values(TaskStatus).includes(status as TaskStatus)) {
        subTask.status = status as TaskStatus;
      }

      await subTaskRepository.save(subTask);
      return res.status(200).json({ message: "Subtask updated", subTask });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addComment = async (req: AuthRequest, res: Response) => {
    const { taskId } = req.params;
    const { commentText } = req.body;

    if (!commentText) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const commentRepository = AppDataSource.getRepository(TaskComment);
      const userRepository = AppDataSource.getRepository(User);
      const task = await taskRepository.findOne({
        where: { id: parseInt(taskId as string) },
        relations: ["assignedUsers"],
      });

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const user = await userRepository.findOneBy({ id: req.user!.id });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isAssigned = task.assignedUsers.some(
        (assigned) => assigned.id === user.id,
      );
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

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (req.user?.role !== "admin") {
        const isAssigned = task.assignedUsers.some(
          (assigned) => assigned.id === req.user?.id,
        );
        if (!isAssigned) {
          return res.status(403).json({ message: "Forbidden" });
        }
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

    if (!feedback) {
      return res.status(400).json({ message: "Feedback is required" });
    }

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

      return res.status(200).json({
        total,
        pending,
        inProgress,
        completed,
        highPriorityTasks,
      });
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

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      await taskRepository.remove(task);
      return res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
