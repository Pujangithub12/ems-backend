import { Response } from "express";
import path from "path";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { AddOrganizationFolderDto } from "../dto/organization-file.dto";
import { filterAndAnnotate, resolveAccessForFile, grantCreatorAccess } from "../utils/fileAccess";
import { roleHasPermission } from "../utils/permissionService";
import { deleteFileFromStorage } from "../config/supabaseStorage";

/** Every ProjectFile row carries its own organizationId regardless of whether it's project-scoped or organization-root — just that column. */
const ownerOrganizationId = (file: { organizationId: number | null }): number | undefined =>
  file.organizationId ?? undefined;

/** Sidebar Documents page: files and folders scoped directly to a organization (no project). */
export class OrganizationFileController {
  /**
   * GET /organization/files — flat list of all organization-level files/folders,
   * plus a read-only mirror of every project's Documents tab: each project
   * that owns at least one file/folder gets a synthetic folder (id = -projectId,
   * not a real row) named after the project, and its files are reparented
   * under it for display. The underlying rows aren't duplicated — download/
   * rename/delete on a mirrored row still hits the real ProjectFile via the
   * shared /projects/files/:fileId endpoints.
   */
  static getOrganizationFiles = async (req: AuthRequest, res: Response) => {
    try {
      const rootFilesRaw = await prisma.projectFile.findMany({
        where: { organizationId: req.organization!.id, projectId: null },
        include: { uploadedBy: true },
        orderBy: [{ isFolder: "desc" }, { createdAt: "asc" }],
      });

      const projectFilesRaw = await prisma.projectFile.findMany({
        where: { project: { organizationId: req.organization!.id } },
        include: { uploadedBy: true, project: true },
        orderBy: [{ isFolder: "desc" }, { createdAt: "asc" }],
      });

      // IDs are unique across the whole ProjectFile table and a node's
      // parentId only ever points within its own project/root scope, so one
      // combined access-filter pass over both lists is safe and correct.
      const combinedIds = [...rootFilesRaw, ...projectFilesRaw].map((f) => f.id);
      const grants = combinedIds.length
        ? await prisma.fileAccess.findMany({ where: { fileId: { in: combinedIds } } })
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
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /organization/folders — create a folder (no physical file). */
  static addOrganizationFolder = async (req: AuthRequest, res: Response) => {
    const { name, parentId }: AddOrganizationFolderDto = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    try {
      const parsedParentId =
        parentId !== undefined && parentId !== null && parentId !== ""
          ? parseInt(parentId as string)
          : null;

      if (parsedParentId !== null) {
        const parentFile = await prisma.projectFile.findFirst({ where: { id: parsedParentId } });
        if (!parentFile || ownerOrganizationId(parentFile) !== req.organization!.id) {
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

      const duplicate = await prisma.projectFile.findFirst({
        where: {
          organizationId: req.organization!.id,
          projectId: null,
          isFolder: true,
          name: { equals: trimmedName, mode: "insensitive" },
          parentId: parsedParentId,
        },
      });

      if (duplicate) {
        return res
          .status(409)
          .json({ message: "A folder with this name already exists" });
      }

      const folder = await prisma.projectFile.create({
        data: {
          name: trimmedName,
          isFolder: true,
          organizationId: req.organization!.id,
          ...(parsedParentId !== null ? { parentId: parsedParentId } : {}),
        },
      });
      await grantCreatorAccess(folder, req.user!.id, req.user!.role, req.organization!.id);
      return res.status(201).json({ message: "Folder created", file: folder });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /organization/files — upload a file (multipart, field "file") into an optional folder. */
  static addOrganizationFile = async (req: AuthRequest, res: Response) => {
    const { parentId } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: "A file is required" });
    }

    const relativePath = path
      .relative("uploads", uploadedFile.path)
      .split(path.sep)
      .join("/");

    try {
      const uploadedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
      const ext = path.extname(uploadedFile.originalname).replace(".", "").toLowerCase();

      const fileData: any = {
        name: uploadedFile.originalname,
        isFolder: false,
        size: uploadedFile.size,
        path: relativePath,
        organizationId: req.organization!.id,
        ...(ext ? { type: ext } : {}),
        ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
      };

      if (parentId !== undefined && parentId !== null && parentId !== "") {
        const parsedParentId = parseInt(parentId as string);
        const parentFile = await prisma.projectFile.findFirst({ where: { id: parsedParentId } });
        if (!parentFile || ownerOrganizationId(parentFile) !== req.organization!.id) {
          deleteFileFromStorage(relativePath);
          return res.status(404).json({ message: "Parent folder not found" });
        }
        const parentLevel = await resolveAccessForFile(parentFile, req.user!.id, req.user!.role);
        if (parentLevel !== "write") {
          deleteFileFromStorage(relativePath);
          return res.status(403).json({ message: "You don't have permission to add items to this folder" });
        }
        fileData.parentId = parsedParentId;
      } else {
        const allowed = await roleHasPermission(req.user!.role, "projects.documents");
        if (!allowed) {
          deleteFileFromStorage(relativePath);
          return res.status(403).json({ message: "You don't have permission to manage documents" });
        }
      }

      const file = await prisma.projectFile.create({ data: fileData });
      await grantCreatorAccess(file, req.user!.id, req.user!.role, req.organization!.id);
      return res.status(201).json({ message: "File uploaded", file });
    } catch (error) {
      deleteFileFromStorage(relativePath);
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
