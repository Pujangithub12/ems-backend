"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadGoodsReceiptFile = exports.uploadCustomsFile = exports.uploadProformaInvoiceFile = exports.uploadPurchaseOrderFile = exports.uploadPurchaseRequestFile = exports.uploadProcurementFile = exports.uploadInventoryFile = exports.uploadOrganizationFile = exports.uploadProjectFile = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Blocks upload of file types the browser would treat as executable/active
// content if served back later (e.g. via the /uploads static route) — this
// is what stands between an uploaded attachment and stored XSS, since none
// of the upload routes otherwise restrict file type today.
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
/** Every per-resource upload destination below joins a route/organization id
 * straight into a filesystem path (`uploads/<segment>/<id>/`). Without this
 * check, an id containing ".." (or anything non-numeric) would let
 * `path.join` resolve outside the intended `uploads/<segment>/` directory —
 * a path-traversal write. Every id used in a destination callback must be
 * validated through this first. */
const parsePositiveIntParam = (value) => {
    if (typeof value !== "string" && typeof value !== "number")
        return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
};
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
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});
// Project documents (Documents tab) stored per-project under uploads/projects/<projectId>/
const sanitizeFilename = (originalname) => {
    const base = path_1.default.basename(originalname).replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
    return base || "file";
};
const projectFileStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const projectId = parsePositiveIntParam(req.params.projectId);
        if (projectId == null) {
            cb(new Error("Invalid project id."), "");
            return;
        }
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
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    },
});
// Organization-level documents (sidebar Documents page) stored under
// uploads/organizations/<organizationId>/ — req.organization is set by authMiddleware,
// which always runs before this in the route chain.
const organizationFileStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const organizationId = parsePositiveIntParam(req.organization?.id);
        if (organizationId == null) {
            cb(new Error("Invalid organization id."), "");
            return;
        }
        const dir = path_1.default.join("uploads", "workspaces", String(organizationId));
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
exports.uploadOrganizationFile = (0, multer_1.default)({
    storage: organizationFileStorage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    },
});
// Inventory item attachments (drawer Documents section), stored under
// uploads/inventory/<itemId>/
const inventoryFileStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const itemId = parsePositiveIntParam(req.params.itemId);
        if (itemId == null) {
            cb(new Error("Invalid item id."), "");
            return;
        }
        const dir = path_1.default.join("uploads", "inventory", String(itemId));
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
exports.uploadInventoryFile = (0, multer_1.default)({
    storage: inventoryFileStorage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    },
});
// Procurement item attachments (drawer Documents section), stored under
// uploads/procurement/<itemId>/
const procurementFileStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const itemId = parsePositiveIntParam(req.params.itemId);
        if (itemId == null) {
            cb(new Error("Invalid item id."), "");
            return;
        }
        const dir = path_1.default.join("uploads", "procurement", String(itemId));
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
exports.uploadProcurementFile = (0, multer_1.default)({
    storage: procurementFileStorage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    },
});
/** Factory for the procurement-pipeline-v2 upload configs below — all follow the same
 * uploads/<segment>/<:itemId param>/ shape as uploadProcurementFile/uploadInventoryFile above. */
const makeOwnedResourceUpload = (segment) => {
    const storage = multer_1.default.diskStorage({
        destination: (req, file, cb) => {
            const itemId = parsePositiveIntParam(req.params.itemId);
            if (itemId == null) {
                cb(new Error("Invalid item id."), "");
                return;
            }
            const dir = path_1.default.join("uploads", segment, String(itemId));
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
    return (0, multer_1.default)({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });
};
// Purchase request attachments (quotations/comparison sheets/general), uploads/purchase-requests/<purchaseRequestId>/
exports.uploadPurchaseRequestFile = makeOwnedResourceUpload("purchase-requests");
// Purchase order attachments, uploads/purchase-orders/<purchaseOrderId>/
exports.uploadPurchaseOrderFile = makeOwnedResourceUpload("purchase-orders");
// Proforma invoice PDF, uploads/proforma-invoices/<proformaInvoiceId>/
exports.uploadProformaInvoiceFile = makeOwnedResourceUpload("proforma-invoices");
// Customs supporting documents (BoL/commercial invoice/etc.), uploads/customs/<customsId>/
exports.uploadCustomsFile = makeOwnedResourceUpload("customs");
// Goods receipt inspection photos, uploads/goods-receipts/<goodsReceiptId>/
exports.uploadGoodsReceiptFile = makeOwnedResourceUpload("goods-receipts");
//# sourceMappingURL=upload.js.map