import { Response } from "express";
import path from "path";
import fs from "fs";
import { IsNull, In } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { ProjectFile } from "../entities/ProjectFile";
import { FileAccess } from "../entities/FileAccess";
import { AuthRequest } from "../middlewares/auth";
import { AddWorkspaceFolderDto } from "../dto/workspace-file.dto";
import { filterAndAnnotate, resolveAccessForFile, grantCreatorAccess } from "../utils/fileAccess";
import { roleHasPermission } from "../utils/permissionService";

/** Sidebar Documents page: files and folders scoped directly to a workspace (no project). */
export class WorkspaceFileController {
  /**
   * GET /workspace/files — flat list of all workspace-level files/folders,
   * plus a read-only mirror of every project's Documents tab: each project
   * that owns at least one file/folder gets a synthetic folder (id = -projectId,
   * not a real row) named after the project, and its files are reparented
   * under it for display. The underlying rows aren't duplicated — download/
   * rename/delete on a mirrored row still hits the real ProjectFile via the
   * shared /projects/files/:fileId endpoints.
   */
  static getWorkspaceFiles = async (req: AuthRequest, res: Response) => {
    try {
      const fileRepository = AppDataSource.getRepository(ProjectFile);

      const rootFilesRaw = await fileRepository.find({
        where: { workspace: { id: req.workspace!.id }, project: IsNull() },
        relations: ["uploadedBy"],
        order: { isFolder: "DESC", createdAt: "ASC" },
      });

      const projectFilesRaw = await fileRepository.find({
        where: { project: { workspace: { id: req.workspace!.id } } },
        relations: ["uploadedBy", "project"],
        order: { isFolder: "DESC", createdAt: "ASC" },
      });

      // IDs are unique across the whole ProjectFile table and a node's
      // parentId only ever points within its own project/root scope, so one
      // combined access-filter pass over both lists is safe and correct.
      const combinedIds = [...rootFilesRaw, ...projectFilesRaw].map((f) => f.id);
      const grants = combinedIds.length
        ? await AppDataSource.getRepository(FileAccess).find({
            where: { file: { id: In(combinedIds) } },
            relations: ["user", "file"],
          })
        : [];
      const rootFiles = filterAndAnnotate(rootFilesRaw, grants, req.user!.id, req.user!.role);
      const projectFiles = filterAndAnnotate(projectFilesRaw, grants, req.user!.id, req.user!.role);

      const projectsById = new Map<number, { id: number; name: string; createdAt: Date }>();
      for (const file of projectFiles) {
        const project = file.project!;
        if (!projectsById.has(project.id)) {
          projectsById.set(project.id, {
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
          });
        }
      }

      const virtualProjectRoots = Array.from(projectsById.values()).map((project) => ({
        id: -project.id,
        name: project.name,
        isFolder: true,
        parentId: null,
        version: "v1.0",
        createdAt: project.createdAt,
        isProjectRoot: true,
        projectId: project.id,
        // Not a real ACL'd node — always shown as read-only here since the
        // frontend already treats every project-owned mirrored row as
        // read-only in this view (editing happens from the project's own
        // Documents tab, where the real write check applies).
        myAccessLevel: "read" as const,
      }));

      const mirroredFiles = projectFiles.map((file) => ({
        id: file.id,
        name: file.name,
        isFolder: file.isFolder,
        type: file.type,
        size: file.size,
        path: file.path,
        version: file.version,
        uploadedBy: file.uploadedBy,
        createdAt: file.createdAt,
        projectId: file.project!.id,
        parentId: file.parentId ?? -file.project!.id,
        myAccessLevel: file.myAccessLevel,
      }));

      return res
        .status(200)
        .json({ files: [...rootFiles, ...virtualProjectRoots, ...mirroredFiles] });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /workspace/folders — create a folder (no physical file). */
  static addWorkspaceFolder = async (req: AuthRequest, res: Response) => {
    const { name, parentId }: AddWorkspaceFolderDto = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    try {
      const fileRepository = AppDataSource.getRepository(ProjectFile);

      const parsedParentId =
        parentId !== undefined && parentId !== null && parentId !== ""
          ? parseInt(parentId as string)
          : null;

      if (parsedParentId !== null) {
        const parentFile = await fileRepository.findOne({
          where: { id: parsedParentId },
          relations: ["project", "project.workspace", "workspace"],
        });
        if (!parentFile || (parentFile.project ? parentFile.project.workspace?.id : parentFile.workspace?.id) !== req.workspace!.id) {
          return res.status(404).json({ message: "Parent folder not found" });
        }
        const parentLevel = await resolveAccessForFile(parentFile, req.user!.id, req.user!.role);
        if (parentLevel !== "write") {
          return res.status(403).json({ message: "You don't have permission to add items to this folder" });
        }
      } else {
        const allowed = await roleHasPermission(req.user!.role, "projects.documents");
        if (!allowed) {
          return res.status(403).json({ message: "You don't have permission to manage documents" });
        }
      }

      const duplicate = await fileRepository
        .createQueryBuilder("file")
        .where("file.workspaceId = :workspaceId", { workspaceId: req.workspace!.id })
        .andWhere("file.projectId IS NULL")
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
        workspace: req.workspace!,
        ...(parsedParentId !== null ? { parentId: parsedParentId } : {}),
      };

      const folder = fileRepository.create(folderData);
      await fileRepository.save(folder);
      await grantCreatorAccess(folder, req.user!.id, req.user!.role, req.workspace!);
      return res.status(201).json({ message: "Folder created", file: folder });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /workspace/files — upload a file (multipart, field "file") into an optional folder. */
  static addWorkspaceFile = async (req: AuthRequest, res: Response) => {
    const { parentId } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: "A file is required" });
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const fileRepository = AppDataSource.getRepository(ProjectFile);

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
        workspace: req.workspace!,
        ...(ext ? { type: ext } : {}),
        ...(uploadedBy ? { uploadedBy } : {}),
      };

      if (parentId !== undefined && parentId !== null && parentId !== "") {
        const parsedParentId = parseInt(parentId as string);
        const parentFile = await fileRepository.findOne({
          where: { id: parsedParentId },
          relations: ["project", "project.workspace", "workspace"],
        });
        if (!parentFile || (parentFile.project ? parentFile.project.workspace?.id : parentFile.workspace?.id) !== req.workspace!.id) {
          fs.unlink(uploadedFile.path, () => {});
          return res.status(404).json({ message: "Parent folder not found" });
        }
        const parentLevel = await resolveAccessForFile(parentFile, req.user!.id, req.user!.role);
        if (parentLevel !== "write") {
          fs.unlink(uploadedFile.path, () => {});
          return res.status(403).json({ message: "You don't have permission to add items to this folder" });
        }
        fileData.parentId = parsedParentId;
      } else {
        const allowed = await roleHasPermission(req.user!.role, "projects.documents");
        if (!allowed) {
          fs.unlink(uploadedFile.path, () => {});
          return res.status(403).json({ message: "You don't have permission to manage documents" });
        }
      }

      const file = fileRepository.create(fileData);
      await fileRepository.save(file);
      await grantCreatorAccess(file, req.user!.id, req.user!.role, req.workspace!);
      return res.status(201).json({ message: "File uploaded", file });
    } catch (error) {
      fs.unlink(uploadedFile.path, () => {});
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
