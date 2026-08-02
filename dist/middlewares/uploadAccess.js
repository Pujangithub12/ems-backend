"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyUploadAccess = void 0;
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../config/prisma");
/**
 * Gates /uploads/<category>/<id-or-filename>/... behind the caller's current
 * organization. express.static alone has no concept of tenant scoping, so
 * without this, any authenticated user (previously: anyone at all, since the
 * route had no auth either) could read another organization's attachments —
 * PO/PI/customs documents, inventory/task files, etc. — just by guessing or
 * incrementing a numeric id in the URL. Mounted between authMiddleware and
 * express.static on the /uploads route in index.ts.
 */
const verifyUploadAccess = async (req, res, next) => {
    const organizationId = req.organization?.id;
    if (!organizationId) {
        return res.status(403).json({ message: "Forbidden" });
    }
    const segments = req.path.split("/").filter(Boolean);
    const [category, idOrFile] = segments;
    const idNum = Number(idOrFile);
    const hasValidId = Number.isInteger(idNum) && idNum > 0;
    try {
        let allowed = false;
        switch (category) {
            // Legacy task attachments: no id embedded in the URL, so ownership is
            // resolved by matching the stored comma-joined filename list instead.
            case "tasks": {
                const filename = idOrFile ? path_1.default.basename(idOrFile) : "";
                if (filename) {
                    const relPath = path_1.default.posix.join("uploads", "tasks", filename);
                    const task = await prisma_1.prisma.task.findFirst({
                        where: {
                            organizationId,
                            OR: [{ files: { contains: filename } }, { files: { contains: relPath } }],
                        },
                        select: { id: true },
                    });
                    allowed = !!task;
                }
                break;
            }
            case "workspaces": {
                allowed = hasValidId && idNum === organizationId;
                break;
            }
            case "projects": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.project.findFirst({
                            where: { id: idNum, organizationId },
                            select: { id: true },
                        }));
                break;
            }
            case "inventory": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.inventoryItem.findFirst({
                            where: { id: idNum, organizationId },
                            select: { id: true },
                        }));
                break;
            }
            case "procurement": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.procurementItem.findFirst({
                            where: { id: idNum, organizationId },
                            select: { id: true },
                        }));
                break;
            }
            case "purchase-requests": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.purchaseRequest.findFirst({
                            where: { id: idNum, organizationId },
                            select: { id: true },
                        }));
                break;
            }
            case "purchase-orders": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.purchaseOrder.findFirst({
                            where: { id: idNum, organizationId },
                            select: { id: true },
                        }));
                break;
            }
            case "proforma-invoices": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.proformaInvoice.findFirst({
                            where: { id: idNum, purchaseOrder: { organizationId } },
                            select: { id: true },
                        }));
                break;
            }
            case "customs": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.customs.findFirst({
                            where: { id: idNum, shipment: { purchaseOrder: { organizationId } } },
                            select: { id: true },
                        }));
                break;
            }
            case "goods-receipts": {
                allowed =
                    hasValidId &&
                        !!(await prisma_1.prisma.goodsReceipt.findFirst({
                            where: { id: idNum, purchaseOrder: { organizationId } },
                            select: { id: true },
                        }));
                break;
            }
            default:
                allowed = false;
        }
        if (!allowed) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    }
    catch (error) {
        console.error("Upload access check error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};
exports.verifyUploadAccess = verifyUploadAccess;
//# sourceMappingURL=uploadAccess.js.map