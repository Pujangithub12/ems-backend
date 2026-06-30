import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Project } from "../entities/Project";
import { User } from "../entities/User";
import { ProjectFile } from "../entities/ProjectFile";
import { ProjectHeading } from "../entities/ProjectHeading";
import { Task } from "../entities/Task";
import { TaskPriority, TaskStatus } from "../entities/TaskEnums";
import { In } from "typeorm";
import { AuthRequest } from "../middlewares/auth";

export class ProjectController {
  static createProject = async (req: AuthRequest, res: Response) => {
    const { name, description, dueDate, status, priority, assigneeIds } =
      req.body;

    if (!name) {
      return res.status(400).json({ message: "Project name is required" });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const userRepository = AppDataSource.getRepository(User);

      let assignees: User[] = [];
      if (assigneeIds && Array.isArray(assigneeIds) && assigneeIds.length > 0) {
        assignees = await userRepository.findBy({ id: In(assigneeIds) });
      }

      const workspace = req.workspace!;
      const projectPayload = {
        name,
        description,
        status:
          status && Object.values(TaskStatus).includes(status)
            ? status
            : TaskStatus.PENDING,
        priority:
          priority && Object.values(TaskPriority).includes(priority)
            ? priority
            : TaskPriority.MEDIUM,
        assignees,
        workspace,
      } as Partial<Project>;

      if (dueDate) {
        projectPayload.dueDate = new Date(dueDate);
      }

      const project = projectRepository.create(projectPayload);
      await projectRepository.save(project);
      return res.status(201).json({ message: "Project created", project });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getAllProjects = async (req: AuthRequest, res: Response) => {
    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const workspace = req.workspace!; // Assert not undefined (set by middleware)
      const projects = await projectRepository.find({
        where: { workspace: { id: workspace.id } },
        relations: [
          "assignees",
          "files",
          "headings",
          "headings.tasks",
          "headings.tasks.assignedUsers",
        ],
        order: { createdAt: "DESC" },
      });
      return res.status(200).json(projects);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getProjectById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const project = await projectRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: [
          "assignees",
          "files",
          "headings",
          "headings.tasks",
          "headings.tasks.assignedUsers",
          "headings.subHeadings",
        ],
      });

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      return res.status(200).json(project);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addProjectHeading = async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { name, parentHeadingId } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Heading name is required" });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const headingRepository = AppDataSource.getRepository(ProjectHeading);

      const project = await projectRepository.findOneBy({
        id: parseInt(projectId as string),
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      let parentHeading;
      if (parentHeadingId) {
        parentHeading = await headingRepository.findOneBy({
          id: parseInt(parentHeadingId as string),
        });
      }

      const headingData: any = {
        name,
        project,
      };

      if (parentHeading) {
        headingData.parentHeading = parentHeading;
      }

      const heading = headingRepository.create(headingData);

      await headingRepository.save(heading);
      return res.status(201).json({ message: "Heading added", heading });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addProjectTask = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const {
      description,
      dueDate,
      headingId,
      title,
      priority,
      assignedUserIds,
      status,
    } = req.body;

    if (!description || !dueDate || !title) {
      return res
        .status(400)
        .json({ message: "Task title, description and dueDate are required" });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const headingRepository = AppDataSource.getRepository(ProjectHeading);
      const taskRepository = AppDataSource.getRepository(Task);
      const userRepository = AppDataSource.getRepository(User);

      const project = await projectRepository.findOneBy({
        id: parseInt(projectId as string),
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      let heading;
      if (headingId) {
        heading = await headingRepository.findOneBy({
          id: parseInt(headingId as string),
        });
      }

      let assignedUsers: User[] = [];
      if (assignedUserIds && Array.isArray(assignedUserIds)) {
        assignedUsers = await userRepository.findBy({
          id: In(assignedUserIds),
        });
      }

      const workspace = req.workspace!;
      const taskData: any = {
        title,
        description,
        dueDate: new Date(dueDate),
        priority: priority || TaskPriority.MEDIUM,
        project,
        assignedUsers,
        status: status || TaskStatus.PENDING,
        progress: 0,
        workspace,
      };

      if (heading) {
        taskData.projectHeading = heading;
      }

      const task = taskRepository.create(taskData);

      await taskRepository.save(task);
      return res.status(201).json({ message: "Task added", task });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateProjectTask = async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { description, dueDate, progress, status, priority, title } =
      req.body;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOneBy({
        id: parseInt(taskId as string),
      });

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (title !== undefined) task.title = title;
      if (description !== undefined) task.description = description;
      if (dueDate !== undefined) task.dueDate = new Date(dueDate);
      if (progress !== undefined) task.progress = progress;
      if (status !== undefined) task.status = status;
      if (priority !== undefined) task.priority = priority;

      await taskRepository.save(task);
      return res.status(200).json({ message: "Task updated", task });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteProjectTask = async (req: Request, res: Response) => {
    const { taskId } = req.params;

    try {
      const taskRepository = AppDataSource.getRepository(Task);
      const task = await taskRepository.findOneBy({
        id: parseInt(taskId as string),
      });

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      await taskRepository.remove(task);
      return res.status(200).json({ message: "Task deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addProjectFile = async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { name, isFolder, type, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ message: "File name is required" });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const fileRepository = AppDataSource.getRepository(ProjectFile);

      const project = await projectRepository.findOneBy({
        id: parseInt(projectId as string),
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const fileData: any = {
        name,
        isFolder: !!isFolder,
        type,
        project,
      };

      if (parentId !== undefined && parentId !== null) {
        fileData.parentId = parseInt(parentId as string);
      }

      const file = fileRepository.create(fileData);

      await fileRepository.save(file);
      return res
        .status(201)
        .json({ message: isFolder ? "Folder added" : "File added", file });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteProjectFile = async (req: Request, res: Response) => {
    const { fileId } = req.params;
    try {
      const fileRepository = AppDataSource.getRepository(ProjectFile);
      const file = await fileRepository.findOneBy({
        id: parseInt(fileId as string),
      });
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      await fileRepository.remove(file);
      return res.status(200).json({ message: "File deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateProject = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, dueDate, status, priority, assigneeIds } =
      req.body;
    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const userRepository = AppDataSource.getRepository(User);
      const project = await projectRepository.findOne({
        where: { id: parseInt(id as string) },
        relations: ["assignees"],
      });

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (name) project.name = name;
      if (description !== undefined) project.description = description;
      if (dueDate !== undefined) {
        project.dueDate = dueDate
          ? new Date(dueDate)
          : (undefined as unknown as Date);
      }
      if (status && Object.values(TaskStatus).includes(status)) {
        project.status = status;
      }
      if (priority && Object.values(TaskPriority).includes(priority)) {
        project.priority = priority;
      }
      if (assigneeIds && Array.isArray(assigneeIds)) {
        project.assignees = await userRepository.findBy({
          id: In(assigneeIds),
        });
      }

      await projectRepository.save(project);
      return res.status(200).json({ message: "Project updated", project });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static deleteProject = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const project = await projectRepository.findOneBy({
        id: parseInt(id as string),
      });

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      await projectRepository.remove(project);
      return res.status(200).json({ message: "Project deleted successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
