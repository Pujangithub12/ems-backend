import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { JWT_SECRET } from "../config/jwt";
import { AddProjectFolderDto, RenameProjectFileDto } from "../dto/project-file.dto";
import { SetFileAccessDto, FileAccessGrantDto } from "../dto/file-access.dto";
import type { FileAccessLevel, FileGranteeType } from "../types/domain";
import {
  filterAndAnnotate,
  resolveAccessForFile,
  grantCreatorAccess,
} from "../utils/fileAccess";
import { roleHasPermission } from "../utils/permissionService";

/** Short-lived, single-file-scoped token purpose, distinct from session JWTs so one can never be used as the other. */
const FILE_VIEW_TOKEN_PURPOSE = "file-view";
interface FileViewTokenPayload {
  purpose: typeof FILE_VIEW_TOKEN_PURPOSE;
  fileId: number;
}

/** A file/folder is either project-scoped (Documents tab) or organization-scoped (sidebar Documents page, project null) — every ProjectFile row carries its own organizationId regardless, so this is just that column. */
const ownerOrganizationId = (file: { organizationId: number | null }): number | undefined =>
  file.organizationId ?? undefined;

/** Documents tab: files and folders scoped to a project. */
export class ProjectFileController {
  /** GET /projects/:projectId/files — flat list of all files/folders for the Documents tab. */
  static getProjectFiles = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: parseInt(projectId as string),
          organizationId: req.organization!.id,
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const files = await prisma.projectFile.findMany({
        where: { projectId: project.id },
        include: { uploadedBy: true },
        orderBy: [{ isFolder: "desc" }, { createdAt: "asc" }],
      });

      const fileIds = files.map((f) => f.id);
      const grants = fileIds.length
        ? await prisma.fileAccess.findMany({ where: { fileId: { in: fileIds } } })
        : [];
      const visible = filterAndAnnotate(files, grants, req.user!.id, req.user!.role);

      return res.status(200).json({ files: visible });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
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
      const project = await prisma.project.findFirst({
        where: {
          id: parseInt(projectId as string),
          organizationId: req.organization!.id,
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

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
        // No parent to check a grant against — fall back to the coarse
        // role permission that used to gate this route.
        const allowed = await roleHasPermission(req.user!.role, "projects.documents");
        if (!allowed) {
          return res.status(403).json({ message: "You don't have permission to manage documents" });
        }
      }

      const duplicate = await prisma.projectFile.findFirst({
        where: {
          projectId: project.id,
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
          projectId: project.id,
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

  /** POST /projects/:projectId/files — upload a file (multipart, field "file") into an optional folder. */
  static addProjectFile = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { parentId } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: "A file is required" });
    }

    try {
      const project = await prisma.project.findFirst({
        where: {
          id: parseInt(projectId as string),
          organizationId: req.organization!.id,
        },
      });
      if (!project) {
        // Clean up the orphaned upload if the project doesn't exist/isn't in this organization
        fs.unlink(uploadedFile.path, () => {});
        return res.status(404).json({ message: "Project not found" });
      }

      const uploadedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
      const relativePath = path
        .relative("uploads", uploadedFile.path)
        .split(path.sep)
        .join("/");
      const ext = path.extname(uploadedFile.originalname).replace(".", "").toLowerCase();

      const fileData: any = {
        name: uploadedFile.originalname,
        isFolder: false,
        size: uploadedFile.size,
        path: relativePath,
        projectId: project.id,
        organizationId: req.organization!.id,
        ...(ext ? { type: ext } : {}),
        ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
      };

      if (parentId !== undefined && parentId !== null && parentId !== "") {
        const parsedParentId = parseInt(parentId as string);
        const parentFile = await prisma.projectFile.findFirst({ where: { id: parsedParentId } });
        if (!parentFile || ownerOrganizationId(parentFile) !== req.organization!.id) {
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

      const file = await prisma.projectFile.create({ data: fileData });
      await grantCreatorAccess(file, req.user!.id, req.user!.role, req.organization!.id);
      return res.status(201).json({ message: "File uploaded", file });
    } catch (error) {
      fs.unlink(uploadedFile.path, () => {});
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /projects/files/:fileId/download — streams the file back with its
   * original name, forcing a download. Requires "write" access — read-only
   * grantees can view the file in-browser (see /view, /view-token) but can't
   * pull a local copy of it.
   */
  static downloadProjectFile = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    try {
      const file = await prisma.projectFile.findFirst({
        where: { id: parseInt(fileId as string) },
      });

      if (
        !file ||
        file.isFolder ||
        !file.path ||
        ownerOrganizationId(file) !== req.organization!.id
      ) {
        return res.status(404).json({ message: "File not found" });
      }

      const level = await resolveAccessForFile(file, req.user!.id, req.user!.role);
      if (level === "none") {
        return res.status(404).json({ message: "File not found" });
      }
      if (level !== "write") {
        return res.status(403).json({ message: "You don't have permission to download this file" });
      }

      const absolutePath = path.resolve("uploads", file.path);
      return res.download(absolutePath, file.name);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /projects/files/:fileId/view — streams the file for inline viewing (not download). PDFs and images display in browser. */
  static viewProjectFile = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    try {
      const file = await prisma.projectFile.findFirst({
        where: { id: parseInt(fileId as string) },
      });

      if (
        !file ||
        file.isFolder ||
        !file.path ||
        ownerOrganizationId(file) !== req.organization!.id
      ) {
        return res.status(404).json({ message: "File not found" });
      }

      const level = await resolveAccessForFile(file, req.user!.id, req.user!.role);
      if (level === "none") {
        return res.status(404).json({ message: "File not found" });
      }

      return ProjectFileController.streamFileInline(res, file.path, file.name);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /projects/files/:fileId/view-token — authenticated. Issues a short-lived
   * (5 min), single-file-scoped token that lets the *unauthenticated* view-public
   * route below serve this one file without a session cookie. Needed so
   * Microsoft's Office Online viewer (which has no way to send our auth cookie)
   * can fetch Word/Excel/PowerPoint files to render an in-browser preview —
   * the read-access check still happens here, before the link is ever issued.
   */
  static getFileViewToken = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    try {
      const file = await prisma.projectFile.findFirst({
        where: { id: parseInt(fileId as string) },
      });

      if (
        !file ||
        file.isFolder ||
        !file.path ||
        ownerOrganizationId(file) !== req.organization!.id
      ) {
        return res.status(404).json({ message: "File not found" });
      }

      const level = await resolveAccessForFile(file, req.user!.id, req.user!.role);
      if (level === "none") {
        return res.status(404).json({ message: "File not found" });
      }

      const payload: FileViewTokenPayload = { purpose: FILE_VIEW_TOKEN_PURPOSE, fileId: file.id };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "5m" });
      // Prefer the raw X-Forwarded-Proto header (works regardless of whether
      // trust-proxy's hop count matches this host's actual proxy chain), then
      // fall back to forcing https in production — this deployment is always
      // https-only there (see the CORS origin list in index.ts) — and only
      // trust req.protocol as-is for local dev. A wrong scheme here means
      // Microsoft's Office viewer can't fetch the file at all ("File not
      // found... not publicly accessible") even though the token/permissions
      // are fine, so this is worth being defensive about.
      const forwardedProtoHeader = req.headers["x-forwarded-proto"];
      const forwardedProto = Array.isArray(forwardedProtoHeader)
        ? forwardedProtoHeader[0]
        : forwardedProtoHeader;
      const protoFromHeader = forwardedProto ? forwardedProto.split(",")[0]?.trim() : undefined;
      const scheme = protoFromHeader || (process.env.NODE_ENV === "production" ? "https" : req.protocol);
      const base = `${scheme}://${req.get("host")}`;
      return res
        .status(200)
        .json({ url: `${base}/api/projects/files/${file.id}/view-public?token=${encodeURIComponent(token)}` });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /projects/files/:fileId/view-public — deliberately NOT behind authMiddleware
   * (see routes.ts): external viewers like Microsoft's Office Online embed can't
   * send our session cookie, so this route is gated entirely by the short-lived
   * signed token from getFileViewToken above instead. The token is scoped to
   * exactly one fileId and expires in 5 minutes, so a leaked/logged URL has a
   * narrow, self-limiting blast radius.
   */
  static viewProjectFilePublic = async (req: Request, res: Response) => {
    const { fileId } = req.params;
    const { token } = req.query;
    try {
      if (typeof token !== "string") {
        return res.status(401).json({ message: "Missing token" });
      }
      let payload: FileViewTokenPayload;
      try {
        payload = jwt.verify(token, JWT_SECRET) as FileViewTokenPayload;
      } catch {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      const parsedFileId = parseInt(fileId as string);
      if (payload.purpose !== FILE_VIEW_TOKEN_PURPOSE || payload.fileId !== parsedFileId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const file = await prisma.projectFile.findFirst({ where: { id: parsedFileId } });
      if (!file || file.isFolder || !file.path) {
        return res.status(404).json({ message: "File not found" });
      }

      return ProjectFileController.streamFileInline(res, file.path, file.name);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** Shared inline-stream body for viewProjectFile / viewProjectFilePublic. */
  private static streamFileInline(res: Response, relativePath: string, fileName: string) {
    const absolutePath = path.resolve("uploads", relativePath);
    const stat = fs.statSync(absolutePath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", stat.size);
    const stream = fs.createReadStream(absolutePath);
    return stream.pipe(res);
  }

  /** PUT /projects/files/:fileId — rename a file or folder. */
  static renameProjectFile = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    const { name }: RenameProjectFileDto = req.body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    try {
      const file = await prisma.projectFile.findFirst({
        where: { id: parseInt(fileId as string) },
      });

      if (!file || ownerOrganizationId(file) !== req.organization!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      const renameLevel = await resolveAccessForFile(file, req.user!.id, req.user!.role);
      if (renameLevel !== "write") {
        return res.status(403).json({ message: "You don't have permission to edit this" });
      }

      if (file.isFolder) {
        const duplicate = await prisma.projectFile.findFirst({
          where: {
            ...(file.projectId !== null
              ? { projectId: file.projectId }
              : { projectId: null, organizationId: file.organizationId }),
            isFolder: true,
            id: { not: file.id },
            name: { equals: trimmedName, mode: "insensitive" },
            parentId: file.parentId ?? null,
          },
        });

        if (duplicate) {
          return res
            .status(409)
            .json({ message: "A folder with this name already exists" });
        }
      }

      const updated = await prisma.projectFile.update({
        where: { id: file.id },
        data: { name: trimmedName },
      });
      return res.status(200).json({ message: "Renamed", file: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /projects/files/:fileId — deletes a file, or a folder and everything inside it. */
  static deleteProjectFile = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    try {
      const file = await prisma.projectFile.findFirst({
        where: { id: parseInt(fileId as string) },
      });
      if (!file || ownerOrganizationId(file) !== req.organization!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      const deleteLevel = await resolveAccessForFile(file, req.user!.id, req.user!.role);
      if (deleteLevel !== "write") {
        return res.status(403).json({ message: "You don't have permission to delete this" });
      }

      // Gather this node plus all descendants (folders can be nested arbitrarily deep),
      // scoped to the same project (Documents tab) or the same organization with no
      // project (sidebar Documents page) — whichever this file belongs to.
      const allInScope = await prisma.projectFile.findMany({
        where:
          file.projectId !== null
            ? { projectId: file.projectId }
            : { organizationId: file.organizationId!, projectId: null },
      });
      const toDelete: typeof allInScope = [];
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

      await prisma.projectFile.deleteMany({ where: { id: { in: toDelete.map((n) => n.id) } } });
      return res.status(200).json({ message: "Deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /projects/files/:fileId/access — explicit grants set directly on this node (not inherited ones). Admin/super_admin only (see routes.ts). */
  static getFileAccess = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    try {
      const file = await prisma.projectFile.findFirst({
        where: { id: parseInt(fileId as string) },
      });
      if (!file || ownerOrganizationId(file) !== req.organization!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      const grants = await prisma.fileAccess.findMany({
        where: { fileId: file.id },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });

      const result: FileAccessGrantDto[] = grants.map((g) => ({
        id: g.id,
        granteeType: g.granteeType as FileGranteeType,
        user: g.user ? { id: g.user.id, fullName: g.user.fullName, email: g.user.email } : null,
        role: g.role ?? undefined,
        level: g.level as FileAccessLevel,
      }));

      return res.status(200).json({ grants: result });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /projects/files/:fileId/access — full-replace the explicit grants on this node. Admin/super_admin only. */
  static setFileAccess = async (req: AuthRequest, res: Response) => {
    const { fileId } = req.params;
    const { grants }: SetFileAccessDto = req.body;

    if (!Array.isArray(grants)) {
      return res.status(400).json({ message: "grants must be an array" });
    }

    try {
      const file = await prisma.projectFile.findFirst({
        where: { id: parseInt(fileId as string) },
      });
      if (!file || ownerOrganizationId(file) !== req.organization!.id) {
        return res.status(404).json({ message: "File not found" });
      }

      const validated = grants.filter(
        (entry) =>
          entry &&
          (entry.granteeType === "user" || entry.granteeType === "role") &&
          (entry.level === "none" || entry.level === "read" || entry.level === "write") &&
          ((entry.granteeType === "user" && entry.userId) || (entry.granteeType === "role" && entry.role)),
      );

      const saved = await prisma.$transaction(async (tx) => {
        await tx.fileAccess.deleteMany({ where: { fileId: file.id } });

        const rows = [];
        for (const v of validated) {
          const row = await tx.fileAccess.create({
            data: {
              fileId: file.id,
              granteeType: v.granteeType,
              ...(v.granteeType === "user" && v.userId !== undefined ? { userId: v.userId } : {}),
              ...(v.granteeType === "role" && v.role !== undefined ? { role: v.role } : {}),
              level: v.level,
              organizationId: req.organization!.id,
              grantedById: req.user!.id,
            },
          });
          rows.push(row);
        }
        return rows;
      });

      return res.status(200).json({ message: "Access updated", grants: saved });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
