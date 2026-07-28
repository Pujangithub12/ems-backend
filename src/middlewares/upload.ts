import multer from "multer";
import path from "path";
import fs from "fs";

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

const fileFilter: NonNullable<multer.Options["fileFilter"]> = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    cb(new Error(`File type "${ext || "(no extension)"}" is not allowed.`));
    return;
  }
  cb(null, true);
};

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
  fileFilter,
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
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

// Organization-level documents (sidebar Documents page) stored under
// uploads/organizations/<organizationId>/ — req.organization is set by authMiddleware,
// which always runs before this in the route chain.
const organizationFileStorage = multer.diskStorage({
  destination: (req: any, file, cb) => {
    const organizationId = req.organization?.id;
    const dir = path.join("uploads", "workspaces", String(organizationId));
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

export const uploadOrganizationFile = multer({
  storage: organizationFileStorage,
  fileFilter,
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
  fileFilter,
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
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

/** Factory for the procurement-pipeline-v2 upload configs below — all follow the same
 * uploads/<segment>/<:itemId param>/ shape as uploadProcurementFile/uploadInventoryFile above. */
const makeOwnedResourceUpload = (segment: string) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const itemId = req.params.itemId;
      const dir = path.join("uploads", segment, String(itemId));
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
  return multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });
};

// Purchase request attachments (quotations/comparison sheets/general), uploads/purchase-requests/<purchaseRequestId>/
export const uploadPurchaseRequestFile = makeOwnedResourceUpload("purchase-requests");
// Purchase order attachments, uploads/purchase-orders/<purchaseOrderId>/
export const uploadPurchaseOrderFile = makeOwnedResourceUpload("purchase-orders");
// Proforma invoice PDF, uploads/proforma-invoices/<proformaInvoiceId>/
export const uploadProformaInvoiceFile = makeOwnedResourceUpload("proforma-invoices");
// Customs supporting documents (BoL/commercial invoice/etc.), uploads/customs/<customsId>/
export const uploadCustomsFile = makeOwnedResourceUpload("customs");
// Goods receipt inspection photos, uploads/goods-receipts/<goodsReceiptId>/
export const uploadGoodsReceiptFile = makeOwnedResourceUpload("goods-receipts");
