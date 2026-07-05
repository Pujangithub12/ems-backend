"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadProjectFile = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Ensure upload directory exists
const uploadDir = "uploads/tasks";
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path_1.default.extname(file.originalname));
    },
});
exports.upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});
// Project documents (Documents tab) — stored per-project under uploads/projects/<projectId>/
const sanitizeFilename = (originalname) => {
    const base = path_1.default.basename(originalname).replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
    return base || "file";
};
const projectFileStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const projectId = req.params.projectId;
        const dir = path_1.default.join("uploads", "projects", String(projectId));
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`);
    },
});
exports.uploadProjectFile = (0, multer_1.default)({
    storage: projectFileStorage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    },
});
//# sourceMappingURL=upload.js.map