"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSiteActivityPhoto = exports.uploadGoodsReceiptFile = exports.uploadCustomsFile = exports.uploadProformaInvoiceFile = exports.uploadProcurementFile = exports.uploadInventoryFile = exports.uploadOrganizationStamp = exports.uploadOrganizationSignature = exports.uploadOrganizationFile = exports.uploadProjectFile = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const supabaseStorage_1 = require("../config/supabaseStorage");
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
const fileFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
        cb(new Error(`File type "${ext || "(no extension)"}" is not allowed.`));
        return;
    }
    cb(null, true);
};
/** Used for the organization letterhead signature/stamp uploads — images only. */
const imageFileFilter = (_req, file, cb) => {
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
const parsePositiveIntParam = (value) => {
    if (typeof value !== "string" && typeof value !== "number")
        return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const sanitizeFilename = (originalname) => {
    const base = path_1.default.basename(originalname).replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
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
async function persistFileToStorage(file, dir) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename = `${uniqueSuffix}-${sanitizeFilename(file.originalname)}`;
    const key = `${dir}/${filename}`;
    await (0, supabaseStorage_1.uploadFileToStorage)(key, file.buffer, file.mimetype);
    file.path = `uploads/${key}`;
    file.destination = `uploads/${dir}`;
    file.filename = filename;
}
/** Builds a [multer-parse, persist-to-storage] middleware pair standing in for what used to be a single multer(diskStorage) instance. */
function makeUploadMiddleware(config) {
    const parser = (0, multer_1.default)({
        storage: multer_1.default.memoryStorage(),
        fileFilter: config.imagesOnly ? imageFileFilter : fileFilter,
        limits: { fileSize: config.fileSizeLimit },
    });
    const parseStep = config.mode === "single" ? parser.single(config.field) : parser.array(config.field);
    const persistStep = async (req, res, next) => {
        try {
            const resolved = config.resolveDir(req);
            if (resolved == null) {
                return res.status(400).json({ message: "Invalid id." });
            }
            const dir = String(resolved);
            if (config.mode === "single") {
                const file = req.file;
                if (file)
                    await persistFileToStorage(file, dir);
            }
            else {
                const files = req.files ?? [];
                await Promise.all(files.map((f) => persistFileToStorage(f, dir)));
            }
            next();
        }
        catch (error) {
            console.error("Upload storage error:", error);
            res.status(500).json({ message: "Failed to store uploaded file." });
        }
    };
    return [parseStep, persistStep];
}
// Task attachments, uploads/tasks/ — no id-based subdirectory (kept flat, matching the pre-migration layout).
exports.upload = makeUploadMiddleware({
    field: "files",
    mode: "array",
    fileSizeLimit: 10 * 1024 * 1024, // 10MB limit
    resolveDir: () => "tasks",
});
// Project documents (Documents tab) stored per-project under uploads/projects/<projectId>/
exports.uploadProjectFile = makeUploadMiddleware({
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
exports.uploadOrganizationFile = makeUploadMiddleware({
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
exports.uploadOrganizationSignature = makeUploadMiddleware({
    field: "file",
    mode: "single",
    fileSizeLimit: 200 * 1024,
    imagesOnly: true,
    resolveDir: (req) => {
        const organizationId = parsePositiveIntParam(req.organization?.id);
        return organizationId == null ? null : `workspaces/${organizationId}/signature`;
    },
});
exports.uploadOrganizationStamp = makeUploadMiddleware({
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
exports.uploadInventoryFile = makeUploadMiddleware({
    field: "file",
    mode: "single",
    fileSizeLimit: 25 * 1024 * 1024, // 25MB limit
    resolveDir: (req) => {
        const itemId = parsePositiveIntParam(req.params.itemId);
        return itemId == null ? null : `inventory/${itemId}`;
    },
});
// Procurement item attachments (drawer Documents section), stored under uploads/procurement/<itemId>/
exports.uploadProcurementFile = makeUploadMiddleware({
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
const makeOwnedResourceUpload = (segment) => makeUploadMiddleware({
    field: "file",
    mode: "single",
    fileSizeLimit: 25 * 1024 * 1024,
    resolveDir: (req) => {
        const itemId = parsePositiveIntParam(req.params.itemId);
        return itemId == null ? null : `${segment}/${itemId}`;
    },
});
// Proforma invoice PDF, uploads/proforma-invoices/<proformaInvoiceId>/
exports.uploadProformaInvoiceFile = makeOwnedResourceUpload("proforma-invoices");
// Customs supporting documents (BoL/commercial invoice/etc.), uploads/customs/<customsId>/
exports.uploadCustomsFile = makeOwnedResourceUpload("customs");
// Goods receipt inspection photos, uploads/goods-receipts/<goodsReceiptId>/
exports.uploadGoodsReceiptFile = makeOwnedResourceUpload("goods-receipts");
// Site Activities daily report photos, uploads/site-activities/<reportId>/ —
// route param is :reportId rather than :itemId, so this can't use
// makeOwnedResourceUpload above (which hardcodes that param name).
exports.uploadSiteActivityPhoto = makeUploadMiddleware({
    field: "file",
    mode: "single",
    fileSizeLimit: 15 * 1024 * 1024,
    imagesOnly: true,
    resolveDir: (req) => {
        const reportId = parsePositiveIntParam(req.params.reportId);
        return reportId == null ? null : `site-activities/${reportId}`;
    },
});
//# sourceMappingURL=upload.js.map