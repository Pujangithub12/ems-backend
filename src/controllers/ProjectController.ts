import { Request, Response } from "express";
import path from "path";
import fs from "fs";
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
      const user = req.user!;

      // Only admins or super admins can create projects
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res
          .status(403)
          .json({ message: "Not authorized to create projects" });
      }

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
      const user = req.user!;

      let projects: Project[];

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
      } else {
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
          .leftJoinAndSelect(
            "subHeadingTask.assignedUsers",
            "subHeadingTaskUser",
          )
          .leftJoinAndSelect("project.projectTasks", "projectTask")
          .leftJoinAndSelect("projectTask.assignedUsers", "projectTaskUser")
          .where("project.workspaceId = :workspaceId", {
            workspaceId: workspace.id,
          })
          .andWhere("assignee.id = :userId", { userId: user.id })
          .orderBy("project.createdAt", "DESC")
          .getMany();
      }

      console.log(
        "[ProjectController.getAllProjects] Projects count:",
        projects.length,
      );
      return res.status(200).json(projects);
    } catch (error) {
      console.error("[ProjectController.getAllProjects] Error:", error);
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static getProjectById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const user = req.user!;
    const workspace = req.workspace!;
    try {
      const projectRepository = AppDataSource.getRepository(Project);

      let project: Project | null;

      if (user.role === "admin" || user.role === "super_admin") {
        project = await projectRepository.findOne({
          where: {
            id: parseInt(id as string),
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
      } else {
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
          .leftJoinAndSelect(
            "subHeadingTask.assignedUsers",
            "subHeadingTaskUser",
          )
          .leftJoinAndSelect("project.projectTasks", "projectTask")
          .leftJoinAndSelect("projectTask.assignedUsers", "projectTaskUser")
          .where("project.id = :projectId", {
            projectId: parseInt(id as string),
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

      console.log(
        "[ProjectController.getProjectById] Found project:",
        project?.id,
        project?.name,
      );
      console.log(
        "[ProjectController.getProjectById] projectTasks length:",
        project?.projectTasks?.length,
      );
      console.log("[ProjectController.getProjectById] headings tasks:");
      project?.headings?.forEach((h) => {
        console.log(`  - Heading ${h.name}: ${h.tasks?.length} tasks`);
        h.subHeadings?.forEach((sh) => {
          console.log(`    - Subheading ${sh.name}: ${sh.tasks?.length} tasks`);
        });
      });

      return res.status(200).json(project);
    } catch (error) {
      console.error("[ProjectController.getProjectById] Error:", error);
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addProjectHeading = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { name, parentHeadingId } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Heading name is required" });
    }

    try {
      const user = req.user!;

      // Only admins or super admins can add headings
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res
          .status(403)
          .json({ message: "Not authorized to add project headings" });
      }

      const projectRepository = AppDataSource.getRepository(Project);
      const headingRepository = AppDataSource.getRepository(ProjectHeading);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
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
      const user = req.user!;

      // Only admins or super admins can add project tasks
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res
          .status(403)
          .json({ message: "Not authorized to add project tasks" });
      }

      const projectRepository = AppDataSource.getRepository(Project);
      const headingRepository = AppDataSource.getRepository(ProjectHeading);
      const taskRepository = AppDataSource.getRepository(Task);
      const userRepository = AppDataSource.getRepository(User);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
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

  /** GET /projects/:projectId/files — flat list of all files/folders for the Documents tab. */
  static getProjectFiles = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const fileRepository = AppDataSource.getRepository(ProjectFile);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const files = await fileRepository.find({
        where: { project: { id: project.id } },
        relations: ["uploadedBy"],
        order: { isFolder: "DESC", createdAt: "ASC" },
      });

      return res.status(200).json({ files });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /projects/:projectId/folders — create a folder (no physical file). */
  static addProjectFolder = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { name, parentId } = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const fileRepository = AppDataSource.getRepository(ProjectFile);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const parsedParentId =
        parentId !== undefined && parentId !== null && parentId !== ""
          ? parseInt(parentId as string)
          : null;

      const duplicate = await fileRepository
        .createQueryBuilder("file")
        .where("file.projectId = :projectId", { projectId: project.id })
        .andWhere("file.isFolder = true")
        .andWhere("LOWER(file.name) = LOWER(:name)", { name: trimmedName })
        .andWhere(
          parsedParentId === null
            ? "file.parentId IS NULL"
            : "file.parentId = :parentId",
          parsedParentId === null ? {} : { parentId: parsedParentId },
        )
        .getOne();

      if (duplicate) {
        return res
          .status(409)
          .json({ message: "A folder with this name already exists" });
      }

      const folderData: Partial<ProjectFile> = {
        name: trimmedName,
        isFolder: true,
        project,
        workspace: req.workspace!,
        ...(parsedParentId !== null ? { parentId: parsedParentId } : {}),
      };

      const folder = fileRepository.create(folderData);
      await fileRepository.save(folder);
      return res.status(201).json({ message: "Folder created", file: folder });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /projects/:projectId/files — upload a file (multipart, field "file") into an optional folder. */
  static addProjectFile = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { parentId } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: "A file is required" });
    }

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const userRepository = AppDataSource.getRepository(User);
      const fileRepository = AppDataSource.getRepository(ProjectFile);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        // Clean up the orphaned upload if the project doesn't exist/isn't in this workspace
        fs.unlink(uploadedFile.path, () => {});
        return res.status(404).json({ message: "Project not found" });
      }

      const uploadedBy = await userRepository.findOneBy({ id: req.user!.id });
      const relativePath = path
        .relative("uploads", uploadedFile.path)
        .split(path.sep)
        .join("/");
      const ext = path.extname(uploadedFile.originalname).replace(".", "").toLowerCase();

      const fileData: Partial<ProjectFile> = {
        name: uploadedFile.originalname,
        isFolder: false,
        size: uploadedFile.size,
        path: relativePath,
        project,
        workspace: req.workspace!,
        ...(ext ? { type: ext } : {}),
        ...(uploadedBy ? { uploadedBy } : {}),
      };

      if (parentId !== undefined && parentId !== null && parentId !== "") {
        fileData.parentId = parseInt(parentId as string);
      }

      const file = fileRepository.create(fileData);
      await fileRepository.save(file);
      return res.status(201).json({ message: "File uploaded", file });
    } catch (error) {
      fs.unlink(uploadedFile.path, () => {});
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /projects/files/:fileId/download — streams the file back with its original name. */
  static downloadProjectFile = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    try {
      const fileRepository = AppDataSource.getRepository(ProjectFile);
      const file = await fileRepository.findOne({
        where: { id: parseInt(fileId as string) },
        relations: ["project", "project.workspace"],
      });

      if (
        !file ||
        file.isFolder ||
        !file.path ||
        file.project?.workspace?.id !== req.workspace!.id
      ) {
        return res.status(404).json({ message: "File not found" });
      }

      const absolutePath = path.resolve("uploads", file.path);
      return res.download(absolutePath, file.name);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** PUT /projects/files/:fileId — rename a file or folder. */
  static renameProjectFile = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    const { name } = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    try {
      const fileRepository = AppDataSource.getRepository(ProjectFile);
      const file = await fileRepository.findOne({
        where: { id: parseInt(fileId as string) },
        relations: ["project", "project.workspace"],
      });

      if (!file || file.project?.workspace?.id !== req.workspace!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      if (file.isFolder) {
        const duplicate = await fileRepository
          .createQueryBuilder("f")
          .where("f.projectId = :projectId", { projectId: file.project.id })
          .andWhere("f.isFolder = true")
          .andWhere("f.id != :id", { id: file.id })
          .andWhere("LOWER(f.name) = LOWER(:name)", { name: trimmedName })
          .andWhere(
            file.parentId === null || file.parentId === undefined
              ? "f.parentId IS NULL"
              : "f.parentId = :parentId",
            file.parentId === null || file.parentId === undefined
              ? {}
              : { parentId: file.parentId },
          )
          .getOne();

        if (duplicate) {
          return res
            .status(409)
            .json({ message: "A folder with this name already exists" });
        }
      }

      file.name = trimmedName;
      await fileRepository.save(file);
      return res.status(200).json({ message: "Renamed", file });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /projects/files/:fileId — deletes a file, or a folder and everything inside it. */
  static deleteProjectFile = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    try {
      const fileRepository = AppDataSource.getRepository(ProjectFile);
      const file = await fileRepository.findOne({
        where: { id: parseInt(fileId as string) },
        relations: ["project", "project.workspace"],
      });
      if (!file || file.project?.workspace?.id !== req.workspace!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      // Gather this node plus all descendants (folders can be nested arbitrarily deep).
      const allInProject = await fileRepository.find({
        where: { project: { id: file.project.id } },
      });
      const toDelete: ProjectFile[] = [];
      const collect = (nodeId: number) => {
        const node = allInProject.find((f) => f.id === nodeId);
        if (node) toDelete.push(node);
        allInProject
          .filter((f) => f.parentId === nodeId)
          .forEach((child) => collect(child.id));
      };
      collect(file.id);

      for (const node of toDelete) {
        if (!node.isFolder && node.path) {
          const absolutePath = path.resolve("uploads", node.path);
          fs.unlink(absolutePath, () => {});
        }
      }

      await fileRepository.remove(toDelete);
      return res.status(200).json({ message: "Deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static updateProject = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, description, dueDate, status, priority, assigneeIds } =
      req.body;
    try {
      const user = req.user!;

      // Only admins or super admins can update projects
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res
          .status(403)
          .json({ message: "Not authorized to update projects" });
      }

      const projectRepository = AppDataSource.getRepository(Project);
      const userRepository = AppDataSource.getRepository(User);
      const project = await projectRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: req.workspace!.id },
        },
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

  static deleteProject = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const user = req.user!;

      // Only admins or super admins can delete projects
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res
          .status(403)
          .json({ message: "Not authorized to delete projects" });
      }

      const projectRepository = AppDataSource.getRepository(Project);
      const project = await projectRepository.findOne({
        where: {
          id: parseInt(id as string),
          workspace: { id: req.workspace!.id },
        },
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
