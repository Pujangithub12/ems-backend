import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure upload directory exists
const uploadDir = "uploads/tasks";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Project documents (Documents tab) stored per-project under uploads/projects/<projectId>/
const sanitizeFilename = (originalname: string): string => {
  const base = path.basename(originalname).replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
  return base || "file";
};

const projectFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.projectId;
    const dir = path.join("uploads", "projects", String(projectId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`);
  },
});

export const uploadProjectFile = multer({
  storage: projectFileStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

// Workspace-level documents (sidebar Documents page) stored under
// uploads/workspaces/<workspaceId>/ — req.workspace is set by authMiddleware,
// which always runs before this in the route chain.
const workspaceFileStorage = multer.diskStorage({
  destination: (req: any, file, cb) => {
    const workspaceId = req.workspace?.id;
    const dir = path.join("uploads", "workspaces", String(workspaceId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`);
  },
});

export const uploadWorkspaceFile = multer({
  storage: workspaceFileStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

// Inventory item attachments (drawer Documents section), stored under
// uploads/inventory/<itemId>/
const inventoryFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const itemId = req.params.itemId;
    const dir = path.join("uploads", "inventory", String(itemId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`);
  },
});

export const uploadInventoryFile = multer({
  storage: inventoryFileStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

// Procurement item attachments (drawer Documents section), stored under
// uploads/procurement/<itemId>/
const procurementFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const itemId = req.params.itemId;
    const dir = path.join("uploads", "procurement", String(itemId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`);
  },
});

export const uploadProcurementFile = multer({
  storage: procurementFileStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});
