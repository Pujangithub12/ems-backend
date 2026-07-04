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

// Project documents (Documents tab) — stored per-project under uploads/projects/<projectId>/
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
