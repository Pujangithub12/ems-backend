"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectFileController = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = require("../config/prisma");
const fileAccess_1 = require("../utils/fileAccess");
const permissionService_1 = require("../utils/permissionService");
/** A file/folder is either project-scoped (Documents tab) or organization-scoped (sidebar Documents page, project null) — every ProjectFile row carries its own organizationId regardless, so this is just that column. */
const ownerOrganizationId = (file) => file.organizationId ?? undefined;
/** Documents tab: files and folders scoped to a project. */
class ProjectFileController {
    /** GET /projects/:projectId/files — flat list of all files/folders for the Documents tab. */
    static getProjectFiles = async (req, res) => {
        const { projectId } = req.params;
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const files = await prisma_1.prisma.projectFile.findMany({
                where: { projectId: project.id },
                include: { uploadedBy: true },
                orderBy: [{ isFolder: "desc" }, { createdAt: "asc" }],
            });
            const fileIds = files.map((f) => f.id);
            const grants = fileIds.length
                ? await prisma_1.prisma.fileAccess.findMany({ where: { fileId: { in: fileIds } } })
                : [];
            const visible = (0, fileAccess_1.filterAndAnnotate)(files, grants, req.user.id, req.user.role);
            return res.status(200).json({ files: visible });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/:projectId/folders — create a folder (no physical file). */
    static addProjectFolder = async (req, res) => {
        const { projectId } = req.params;
        const { name, parentId } = req.body;
        const trimmedName = typeof name === "string" ? name.trim() : "";
        if (!trimmedName) {
            return res.status(400).json({ message: "Folder name is required" });
        }
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const parsedParentId = parentId !== undefined && parentId !== null && parentId !== ""
                ? parseInt(parentId)
                : null;
            if (parsedParentId !== null) {
                const parentFile = await prisma_1.prisma.projectFile.findFirst({ where: { id: parsedParentId } });
                if (!parentFile || ownerOrganizationId(parentFile) !== req.organization.id) {
                    return res.status(404).json({ message: "Parent folder not found" });
                }
                const parentLevel = await (0, fileAccess_1.resolveAccessForFile)(parentFile, req.user.id, req.user.role);
                if (parentLevel !== "write") {
                    return res.status(403).json({ message: "You don't have permission to add items to this folder" });
                }
            }
            else {
                // No parent to check a grant against — fall back to the coarse
                // role permission that used to gate this route.
                const allowed = await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.documents");
                if (!allowed) {
                    return res.status(403).json({ message: "You don't have permission to manage documents" });
                }
            }
            const duplicate = await prisma_1.prisma.projectFile.findFirst({
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
            const folder = await prisma_1.prisma.projectFile.create({
                data: {
                    name: trimmedName,
                    isFolder: true,
                    projectId: project.id,
                    organizationId: req.organization.id,
                    ...(parsedParentId !== null ? { parentId: parsedParentId } : {}),
                },
            });
            await (0, fileAccess_1.grantCreatorAccess)(folder, req.user.id, req.user.role, req.organization.id);
            return res.status(201).json({ message: "Folder created", file: folder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/:projectId/files — upload a file (multipart, field "file") into an optional folder. */
    static addProjectFile = async (req, res) => {
        const { projectId } = req.params;
        const { parentId } = req.body;
        const uploadedFile = req.file;
        if (!uploadedFile) {
            return res.status(400).json({ message: "A file is required" });
        }
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                // Clean up the orphaned upload if the project doesn't exist/isn't in this organization
                fs_1.default.unlink(uploadedFile.path, () => { });
                return res.status(404).json({ message: "Project not found" });
            }
            const uploadedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const relativePath = path_1.default
                .relative("uploads", uploadedFile.path)
                .split(path_1.default.sep)
                .join("/");
            const ext = path_1.default.extname(uploadedFile.originalname).replace(".", "").toLowerCase();
            const fileData = {
                name: uploadedFile.originalname,
                isFolder: false,
                size: uploadedFile.size,
                path: relativePath,
                projectId: project.id,
                organizationId: req.organization.id,
                ...(ext ? { type: ext } : {}),
                ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
            };
            if (parentId !== undefined && parentId !== null && parentId !== "") {
                const parsedParentId = parseInt(parentId);
                const parentFile = await prisma_1.prisma.projectFile.findFirst({ where: { id: parsedParentId } });
                if (!parentFile || ownerOrganizationId(parentFile) !== req.organization.id) {
                    fs_1.default.unlink(uploadedFile.path, () => { });
                    return res.status(404).json({ message: "Parent folder not found" });
                }
                const parentLevel = await (0, fileAccess_1.resolveAccessForFile)(parentFile, req.user.id, req.user.role);
                if (parentLevel !== "write") {
                    fs_1.default.unlink(uploadedFile.path, () => { });
                    return res.status(403).json({ message: "You don't have permission to add items to this folder" });
                }
                fileData.parentId = parsedParentId;
            }
            else {
                const allowed = await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.documents");
                if (!allowed) {
                    fs_1.default.unlink(uploadedFile.path, () => { });
                    return res.status(403).json({ message: "You don't have permission to manage documents" });
                }
            }
            const file = await prisma_1.prisma.projectFile.create({ data: fileData });
            await (0, fileAccess_1.grantCreatorAccess)(file, req.user.id, req.user.role, req.organization.id);
            return res.status(201).json({ message: "File uploaded", file });
        }
        catch (error) {
            fs_1.default.unlink(uploadedFile.path, () => { });
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /projects/files/:fileId/download — streams the file back with its original name. */
    static downloadProjectFile = async (req, res) => {
        const { fileId } = req.params;
        try {
            const file = await prisma_1.prisma.projectFile.findFirst({
                where: { id: parseInt(fileId) },
            });
            if (!file ||
                file.isFolder ||
                !file.path ||
                ownerOrganizationId(file) !== req.organization.id) {
                return res.status(404).json({ message: "File not found" });
            }
            const level = await (0, fileAccess_1.resolveAccessForFile)(file, req.user.id, req.user.role);
            if (level === "none") {
                return res.status(404).json({ message: "File not found" });
            }
            const absolutePath = path_1.default.resolve("uploads", file.path);
            return res.download(absolutePath, file.name);
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** PUT /projects/files/:fileId — rename a file or folder. */
    static renameProjectFile = async (req, res) => {
        const { fileId } = req.params;
        const { name } = req.body;
        const trimmedName = typeof name === "string" ? name.trim() : "";
        if (!trimmedName) {
            return res.status(400).json({ message: "Name is required" });
        }
        try {
            const file = await prisma_1.prisma.projectFile.findFirst({
                where: { id: parseInt(fileId) },
            });
            if (!file || ownerOrganizationId(file) !== req.organization.id) {
                return res.status(404).json({ message: "File not found" });
            }
            const renameLevel = await (0, fileAccess_1.resolveAccessForFile)(file, req.user.id, req.user.role);
            if (renameLevel !== "write") {
                return res.status(403).json({ message: "You don't have permission to edit this" });
            }
            if (file.isFolder) {
                const duplicate = await prisma_1.prisma.projectFile.findFirst({
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
            const updated = await prisma_1.prisma.projectFile.update({
                where: { id: file.id },
                data: { name: trimmedName },
            });
            return res.status(200).json({ message: "Renamed", file: updated });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /projects/files/:fileId — deletes a file, or a folder and everything inside it. */
    static deleteProjectFile = async (req, res) => {
        const { fileId } = req.params;
        try {
            const file = await prisma_1.prisma.projectFile.findFirst({
                where: { id: parseInt(fileId) },
            });
            if (!file || ownerOrganizationId(file) !== req.organization.id) {
                return res.status(404).json({ message: "File not found" });
            }
            const deleteLevel = await (0, fileAccess_1.resolveAccessForFile)(file, req.user.id, req.user.role);
            if (deleteLevel !== "write") {
                return res.status(403).json({ message: "You don't have permission to delete this" });
            }
            // Gather this node plus all descendants (folders can be nested arbitrarily deep),
            // scoped to the same project (Documents tab) or the same organization with no
            // project (sidebar Documents page) — whichever this file belongs to.
            const allInScope = await prisma_1.prisma.projectFile.findMany({
                where: file.projectId !== null
                    ? { projectId: file.projectId }
                    : { organizationId: file.organizationId, projectId: null },
            });
            const toDelete = [];
            const collect = (nodeId) => {
                const node = allInScope.find((f) => f.id === nodeId);
                if (node)
                    toDelete.push(node);
                allInScope
                    .filter((f) => f.parentId === nodeId)
                    .forEach((child) => collect(child.id));
            };
            collect(file.id);
            for (const node of toDelete) {
                if (!node.isFolder && node.path) {
                    const absolutePath = path_1.default.resolve("uploads", node.path);
                    fs_1.default.unlink(absolutePath, () => { });
                }
            }
            await prisma_1.prisma.projectFile.deleteMany({ where: { id: { in: toDelete.map((n) => n.id) } } });
            return res.status(200).json({ message: "Deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /projects/files/:fileId/access — explicit grants set directly on this node (not inherited ones). Admin/super_admin only (see routes.ts). */
    static getFileAccess = async (req, res) => {
        const { fileId } = req.params;
        try {
            const file = await prisma_1.prisma.projectFile.findFirst({
                where: { id: parseInt(fileId) },
            });
            if (!file || ownerOrganizationId(file) !== req.organization.id) {
                return res.status(404).json({ message: "File not found" });
            }
            const grants = await prisma_1.prisma.fileAccess.findMany({
                where: { fileId: file.id },
                include: { user: true },
                orderBy: { createdAt: "asc" },
            });
            const result = grants.map((g) => ({
                id: g.id,
                granteeType: g.granteeType,
                user: g.user ? { id: g.user.id, fullName: g.user.fullName, email: g.user.email } : null,
                role: g.role ?? undefined,
                level: g.level,
            }));
            return res.status(200).json({ grants: result });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** PUT /projects/files/:fileId/access — full-replace the explicit grants on this node. Admin/super_admin only. */
    static setFileAccess = async (req, res) => {
        const { fileId } = req.params;
        const { grants } = req.body;
        if (!Array.isArray(grants)) {
            return res.status(400).json({ message: "grants must be an array" });
        }
        try {
            const file = await prisma_1.prisma.projectFile.findFirst({
                where: { id: parseInt(fileId) },
            });
            if (!file || ownerOrganizationId(file) !== req.organization.id) {
                return res.status(404).json({ message: "File not found" });
            }
            const validated = grants.filter((entry) => entry &&
                (entry.granteeType === "user" || entry.granteeType === "role") &&
                (entry.level === "none" || entry.level === "read" || entry.level === "write") &&
                ((entry.granteeType === "user" && entry.userId) || (entry.granteeType === "role" && entry.role)));
            const saved = await prisma_1.prisma.$transaction(async (tx) => {
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
                            organizationId: req.organization.id,
                            grantedById: req.user.id,
                        },
                    });
                    rows.push(row);
                }
                return rows;
            });
            return res.status(200).json({ message: "Access updated", grants: saved });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.ProjectFileController = ProjectFileController;
//# sourceMappingURL=ProjectFileController.js.map