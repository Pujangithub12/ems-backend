"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectFileController = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const data_source_1 = require("../config/data-source");
const Project_1 = require("../entities/Project");
const User_1 = require("../entities/User");
const ProjectFile_1 = require("../entities/ProjectFile");
/** Documents tab: files and folders scoped to a project. */
class ProjectFileController {
    /** GET /projects/:projectId/files — flat list of all files/folders for the Documents tab. */
    static getProjectFiles = async (req, res) => {
        const { projectId } = req.params;
        try {
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const fileRepository = data_source_1.AppDataSource.getRepository(ProjectFile_1.ProjectFile);
            const project = await projectRepository.findOne({
                where: {
                    id: parseInt(projectId),
                    workspace: { id: req.workspace.id },
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
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
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const fileRepository = data_source_1.AppDataSource.getRepository(ProjectFile_1.ProjectFile);
            const project = await projectRepository.findOne({
                where: {
                    id: parseInt(projectId),
                    workspace: { id: req.workspace.id },
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const parsedParentId = parentId !== undefined && parentId !== null && parentId !== ""
                ? parseInt(parentId)
                : null;
            const duplicate = await fileRepository
                .createQueryBuilder("file")
                .where("file.projectId = :projectId", { projectId: project.id })
                .andWhere("file.isFolder = true")
                .andWhere("LOWER(file.name) = LOWER(:name)", { name: trimmedName })
                .andWhere(parsedParentId === null
                ? "file.parentId IS NULL"
                : "file.parentId = :parentId", parsedParentId === null ? {} : { parentId: parsedParentId })
                .getOne();
            if (duplicate) {
                return res
                    .status(409)
                    .json({ message: "A folder with this name already exists" });
            }
            const folderData = {
                name: trimmedName,
                isFolder: true,
                project,
                workspace: req.workspace,
                ...(parsedParentId !== null ? { parentId: parsedParentId } : {}),
            };
            const folder = fileRepository.create(folderData);
            await fileRepository.save(folder);
            return res.status(201).json({ message: "Folder created", file: folder });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
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
            const projectRepository = data_source_1.AppDataSource.getRepository(Project_1.Project);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const fileRepository = data_source_1.AppDataSource.getRepository(ProjectFile_1.ProjectFile);
            const project = await projectRepository.findOne({
                where: {
                    id: parseInt(projectId),
                    workspace: { id: req.workspace.id },
                },
            });
            if (!project) {
                // Clean up the orphaned upload if the project doesn't exist/isn't in this workspace
                fs_1.default.unlink(uploadedFile.path, () => { });
                return res.status(404).json({ message: "Project not found" });
            }
            const uploadedBy = await userRepository.findOneBy({ id: req.user.id });
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
                project,
                workspace: req.workspace,
                ...(ext ? { type: ext } : {}),
                ...(uploadedBy ? { uploadedBy } : {}),
            };
            if (parentId !== undefined && parentId !== null && parentId !== "") {
                fileData.parentId = parseInt(parentId);
            }
            const file = fileRepository.create(fileData);
            await fileRepository.save(file);
            return res.status(201).json({ message: "File uploaded", file });
        }
        catch (error) {
            fs_1.default.unlink(uploadedFile.path, () => { });
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    /** GET /projects/files/:fileId/download — streams the file back with its original name. */
    static downloadProjectFile = async (req, res) => {
        const { fileId } = req.params;
        try {
            const fileRepository = data_source_1.AppDataSource.getRepository(ProjectFile_1.ProjectFile);
            const file = await fileRepository.findOne({
                where: { id: parseInt(fileId) },
                relations: ["project", "project.workspace"],
            });
            if (!file ||
                file.isFolder ||
                !file.path ||
                file.project?.workspace?.id !== req.workspace.id) {
                return res.status(404).json({ message: "File not found" });
            }
            const absolutePath = path_1.default.resolve("uploads", file.path);
            return res.download(absolutePath, file.name);
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
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
            const fileRepository = data_source_1.AppDataSource.getRepository(ProjectFile_1.ProjectFile);
            const file = await fileRepository.findOne({
                where: { id: parseInt(fileId) },
                relations: ["project", "project.workspace"],
            });
            if (!file || file.project?.workspace?.id !== req.workspace.id) {
                return res.status(404).json({ message: "File not found" });
            }
            if (file.isFolder) {
                const duplicate = await fileRepository
                    .createQueryBuilder("f")
                    .where("f.projectId = :projectId", { projectId: file.project.id })
                    .andWhere("f.isFolder = true")
                    .andWhere("f.id != :id", { id: file.id })
                    .andWhere("LOWER(f.name) = LOWER(:name)", { name: trimmedName })
                    .andWhere(file.parentId === null || file.parentId === undefined
                    ? "f.parentId IS NULL"
                    : "f.parentId = :parentId", file.parentId === null || file.parentId === undefined
                    ? {}
                    : { parentId: file.parentId })
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
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    /** DELETE /projects/files/:fileId — deletes a file, or a folder and everything inside it. */
    static deleteProjectFile = async (req, res) => {
        const { fileId } = req.params;
        try {
            const fileRepository = data_source_1.AppDataSource.getRepository(ProjectFile_1.ProjectFile);
            const file = await fileRepository.findOne({
                where: { id: parseInt(fileId) },
                relations: ["project", "project.workspace"],
            });
            if (!file || file.project?.workspace?.id !== req.workspace.id) {
                return res.status(404).json({ message: "File not found" });
            }
            // Gather this node plus all descendants (folders can be nested arbitrarily deep).
            const allInProject = await fileRepository.find({
                where: { project: { id: file.project.id } },
            });
            const toDelete = [];
            const collect = (nodeId) => {
                const node = allInProject.find((f) => f.id === nodeId);
                if (node)
                    toDelete.push(node);
                allInProject
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
            await fileRepository.remove(toDelete);
            return res.status(200).json({ message: "Deleted" });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.ProjectFileController = ProjectFileController;
//# sourceMappingURL=ProjectFileController.js.map