import multer from "multer";
import path from "path";
import { Response, NextFunction, RequestHandler } from "express";
import { AuthRequest } from "./auth";
import { uploadFileToStorage } from "../config/supabaseStorage";

// Blocks upload of file types the browser would treat as executable/active
// content if served back later — this is what stands between an uploaded
// attachment and stored XSS, since none of the upload routes otherwise
// restrict file type today.
const BLOCKED_EXTENSIONS = new Set([
  ".html", ".htm", ".xhtml", ".shtml", ".svg", ".svgz",
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".php", ".phtml", ".php3", ".php4", ".php5", ".php7", ".phar",
  ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".ps1", ".vbs", ".vbe",
  ".wsf", ".wsh", ".jar", ".apk", ".dll", ".sh", ".jsp", ".jspx", ".asp",
  ".aspx", ".cer", ".hta",
]);

const fileFilter: NonNullable<multer.Options["fileFilter"]> = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    cb(new Error(`File type "${ext || "(no extension)"}" is not allowed.`));
    return;
  }
  cb(null, true);
};

/** Used for the organization letterhead signature/stamp uploads — images only. */
const imageFileFilter: NonNullable<multer.Options["fileFilter"]> = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    cb(new Error(`File type "${file.mimetype}" is not allowed — only image files may be uploaded here.`));
    return;
  }
  cb(null, true);
};

/** Every per-resource upload destination below joins a route/organization id
 * straight into a storage key (`<segment>/<id>/<filename>`). Without this
 * check, an id containing ".." (or anything non-numeric) would let a
 * malformed key escape the intended `<segment>/` prefix — a path-traversal
 * write. Every id used to build a key must be validated through this first. */
const parsePositiveIntParam = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const sanitizeFilename = (originalname: string): string => {
  const base = path.basename(originalname).replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
  return base || "file";
};

/**
 * Uploads one already-parsed (in-memory) multer file to Supabase Storage
 * under `<dir>/<uniqueSuffix>-<sanitizedName>`, then mutates the file object
 * to look like a diskStorage result (`path`/`destination`/`filename` set to
 * that same key, prefixed with "uploads/") — every controller that reads
 * `file.path` and strips the "uploads/" prefix before saving it to the DB
 * keeps working completely unchanged, now storing a Storage key instead of a
 * local disk path.
 */
async function persistFileToStorage(file: Express.Multer.File, dir: string): Promise<void> {
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const filename = `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`;
  const key = `${dir}/${filename}`;
  await uploadFileToStorage(key, file.buffer, file.mimetype);
  file.path = `uploads/${key}`;
  file.destination = `uploads/${dir}`;
  file.filename = filename;
}

interface UploadConfig {
  field: string;
  mode: "single" | "array";
  fileSizeLimit: number;
  /** Returns the storage directory (e.g. "projects/10"), or null to reject the request with 400. */
  resolveDir: (req: AuthRequest) => number | string | null;
  /** Restrict to image mimetypes only — used for the org letterhead signature/stamp uploads. */
  imagesOnly?: boolean;
}

/** Builds a [multer-parse, persist-to-storage] middleware pair standing in for what used to be a single multer(diskStorage) instance. */
function makeUploadMiddleware(config: UploadConfig): RequestHandler[] {
  const parser = multer({
    storage: multer.memoryStorage(),
    fileFilter: config.imagesOnly ? imageFileFilter : fileFilter,
    limits: { fileSize: config.fileSizeLimit },
  });
  const parseStep = config.mode === "single" ? parser.single(config.field) : parser.array(config.field);

  const persistStep = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const resolved = config.resolveDir(req);
      if (resolved == null) {
        return res.status(400).json({ message: "Invalid id." });
      }
      const dir = String(resolved);

      if (config.mode === "single") {
        const file = req.file;
        if (file) await persistFileToStorage(file, dir);
      } else {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        await Promise.all(files.map((f) => persistFileToStorage(f, dir)));
      }
      next();
    } catch (error) {
      console.error("Upload storage error:", error);
      res.status(500).json({ message: "Failed to store uploaded file." });
    }
  };

  return [parseStep, persistStep];
}

// Task attachments, uploads/tasks/ — no id-based subdirectory (kept flat, matching the pre-migration layout).
export const upload = makeUploadMiddleware({
  field: "files",
  mode: "array",
  fileSizeLimit: 10 * 1024 * 1024, // 10MB limit
  resolveDir: () => "tasks",
});

// Project documents (Documents tab) stored per-project under uploads/projects/<projectId>/
export const uploadProjectFile = makeUploadMiddleware({
  field: "file",
  mode: "single",
  fileSizeLimit: 25 * 1024 * 1024, // 25MB limit
  resolveDir: (req) => {
    const projectId = parsePositiveIntParam(req.params.projectId);
    return projectId == null ? null : `projects/${projectId}`;
  },
});

// Organization-level documents (sidebar Documents page) stored under
// uploads/workspaces/<organizationId>/ — req.organization is set by authMiddleware,
// which always runs before this in the route chain.
export const uploadOrganizationFile = makeUploadMiddleware({
  field: "file",
  mode: "single",
  fileSizeLimit: 25 * 1024 * 1024, // 25MB limit
  resolveDir: (req) => {
    const organizationId = parsePositiveIntParam(req.organization?.id);
    return organizationId == null ? null : `workspaces/${organizationId}`;
  },
});

// Organization letterhead signature/stamp images (Settings > Organization tab), stored under
// uploads/workspaces/<organizationId>/signature|stamp/ — used when generating Purchase Order
// PDFs (see purchaseOrderPdf.ts). Capped small (200KB) since these are just a letterhead
// signature/seal image, not a general document attachment.
export const uploadOrganizationSignature = makeUploadMiddleware({
  field: "file",
  mode: "single",
  fileSizeLimit: 200 * 1024,
  imagesOnly: true,
  resolveDir: (req) => {
    const organizationId = parsePositiveIntParam(req.organization?.id);
    return organizationId == null ? null : `workspaces/${organizationId}/signature`;
  },
});
export const uploadOrganizationStamp = makeUploadMiddleware({
  field: "file",
  mode: "single",
  fileSizeLimit: 200 * 1024,
  imagesOnly: true,
  resolveDir: (req) => {
    const organizationId = parsePositiveIntParam(req.organization?.id);
    return organizationId == null ? null : `workspaces/${organizationId}/stamp`;
  },
});

// Inventory item attachments (drawer Documents section), stored under uploads/inventory/<itemId>/
export const uploadInventoryFile = makeUploadMiddleware({
  field: "file",
  mode: "single",
  fileSizeLimit: 25 * 1024 * 1024, // 25MB limit
  resolveDir: (req) => {
    const itemId = parsePositiveIntParam(req.params.itemId);
    return itemId == null ? null : `inventory/${itemId}`;
  },
});

// Procurement item attachments (drawer Documents section), stored under uploads/procurement/<itemId>/
export const uploadProcurementFile = makeUploadMiddleware({
  field: "file",
  mode: "single",
  fileSizeLimit: 25 * 1024 * 1024, // 25MB limit
  resolveDir: (req) => {
    const itemId = parsePositiveIntParam(req.params.itemId);
    return itemId == null ? null : `procurement/${itemId}`;
  },
});

/** Factory for the procurement-pipeline-v2 upload configs below — all follow the same
 * <segment>/<:itemId param>/ shape as uploadProcurementFile/uploadInventoryFile above. */
const makeOwnedResourceUpload = (segment: string): RequestHandler[] =>
  makeUploadMiddleware({
    field: "file",
    mode: "single",
    fileSizeLimit: 25 * 1024 * 1024,
    resolveDir: (req) => {
      const itemId = parsePositiveIntParam(req.params.itemId);
      return itemId == null ? null : `${segment}/${itemId}`;
    },
  });

// Proforma invoice PDF, uploads/proforma-invoices/<proformaInvoiceId>/
export const uploadProformaInvoiceFile = makeOwnedResourceUpload("proforma-invoices");
// Customs supporting documents (BoL/commercial invoice/etc.), uploads/customs/<customsId>/
export const uploadCustomsFile = makeOwnedResourceUpload("customs");
// Goods receipt inspection photos, uploads/goods-receipts/<goodsReceiptId>/
export const uploadGoodsReceiptFile = makeOwnedResourceUpload("goods-receipts");
