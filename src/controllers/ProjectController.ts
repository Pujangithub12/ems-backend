import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Project } from "../entities/Project";
import { User } from "../entities/User";
import { ProjectHeading } from "../entities/ProjectHeading";
import { Task } from "../entities/Task";
import { TaskPriority, TaskStatus } from "../entities/TaskEnums";
import { In } from "typeorm";
import { AuthRequest } from "../middlewares/auth";
import {
  CreateProjectDto,
  UpdateProjectDto,
  AddProjectHeadingDto,
  AddProjectTaskDto,
  UpdateProjectTaskDto,
} from "../dto/project.dto";
import { getDescendantUserIds } from "../utils/hierarchyAuthority";

const sanitizeAssignees = (project: Project) => {
  if (project.assignees) {
    project.assignees = project.assignees.map((u) => {
      const { password, ...rest } = u;
      return rest as User;
    });
  }
};

export class ProjectController {
  static createProject = async (req: AuthRequest, res: Response) => {
    const { name, description, dueDate, status, priority, assigneeIds }: CreateProjectDto =
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
          status && Object.values(TaskStatus).includes(status as TaskStatus)
            ? status
            : TaskStatus.PENDING,
        priority:
          priority && Object.values(TaskPriority).includes(priority as TaskPriority)
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

      sanitizeAssignees(project);

      return res.status(200).json(project);
    } catch (error) {
      console.error("[ProjectController.getProjectById] Error:", error);
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  static addProjectHeading = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { name, parentHeadingId }: AddProjectHeadingDto = req.body;

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
    }: AddProjectTaskDto = req.body;

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
        if (user.role !== "super_admin") {
          const descendantIds = new Set(
            await getDescendantUserIds(req.workspace!.id, user.id),
          );
          const invalidIds = assignedUserIds.filter(
            (uid) => uid !== user.id && !descendantIds.has(uid),
          );
          if (invalidIds.length > 0) {
            return res.status(403).json({
              message:
                "You can only assign a task to yourself or someone below you in the hierarchy",
            });
          }
        }
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
        projectName: project.name,
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
    const { description, dueDate, progress, status, priority, title }: UpdateProjectTaskDto =
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
      if (status !== undefined) task.status = status as TaskStatus;
      if (priority !== undefined) task.priority = priority as TaskPriority;

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

  static updateProject = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, description, dueDate, status, priority, assigneeIds }: UpdateProjectDto =
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
      if (status && Object.values(TaskStatus).includes(status as TaskStatus)) {
        project.status = status as TaskStatus;
      }
      if (priority && Object.values(TaskPriority).includes(priority as TaskPriority)) {
        project.priority = priority as TaskPriority;
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
