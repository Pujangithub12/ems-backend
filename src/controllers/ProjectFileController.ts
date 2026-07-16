import { Response } from "express";
import path from "path";
import fs from "fs";
import { IsNull } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Project } from "../entities/Project";
import { User } from "../entities/User";
import { ProjectFile } from "../entities/ProjectFile";
import { AuthRequest } from "../middlewares/auth";
import { AddProjectFolderDto, RenameProjectFileDto } from "../dto/project-file.dto";

/** A file/folder is either project-scoped (Documents tab) or workspace-scoped (sidebar Documents page, project null) — resolve whichever workspace actually owns it. */
const ownerWorkspaceId = (file: ProjectFile): number | undefined =>
  file.project ? file.project.workspace?.id : file.workspace?.id;

/** Documents tab: files and folders scoped to a project. */
export class ProjectFileController {
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
    const { name, parentId }: AddProjectFolderDto = req.body;

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
        relations: ["project", "project.workspace", "workspace"],
      });

      if (
        !file ||
        file.isFolder ||
        !file.path ||
        ownerWorkspaceId(file) !== req.workspace!.id
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
    const { name }: RenameProjectFileDto = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    try {
      const fileRepository = AppDataSource.getRepository(ProjectFile);
      const file = await fileRepository.findOne({
        where: { id: parseInt(fileId as string) },
        relations: ["project", "project.workspace", "workspace"],
      });

      if (!file || ownerWorkspaceId(file) !== req.workspace!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      if (file.isFolder) {
        const duplicate = await fileRepository
          .createQueryBuilder("f")
          .where(
            file.project ? "f.projectId = :scopeId" : "f.workspaceId = :scopeId",
            { scopeId: file.project ? file.project.id : file.workspace!.id },
          )
          .andWhere(file.project ? "1=1" : "f.projectId IS NULL")
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
        relations: ["project", "project.workspace", "workspace"],
      });
      if (!file || ownerWorkspaceId(file) !== req.workspace!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      // Gather this node plus all descendants (folders can be nested arbitrarily deep),
      // scoped to the same project (Documents tab) or the same workspace with no
      // project (sidebar Documents page) — whichever this file belongs to.
      const allInScope = await fileRepository.find({
        where: file.project
          ? { project: { id: file.project.id } }
          : { workspace: { id: file.workspace!.id }, project: IsNull() },
      });
      const toDelete: ProjectFile[] = [];
      const collect = (nodeId: number) => {
        const node = allInScope.find((f) => f.id === nodeId);
        if (node) toDelete.push(node);
        allInScope
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
}
