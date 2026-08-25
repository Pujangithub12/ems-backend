import { Response, NextFunction } from "express";
import path from "path";
import { prisma } from "../config/prisma";
import { AuthRequest } from "./auth";

/**
 * Gates /uploads/<category>/<id-or-filename>/... behind the caller's current
 * organization. express.static alone has no concept of tenant scoping, so
 * without this, any authenticated user (previously: anyone at all, since the
 * route had no auth either) could read another organization's attachments —
 * PO/PI/customs documents, inventory/task files, etc. — just by guessing or
 * incrementing a numeric id in the URL. Mounted between authMiddleware and
 * express.static on the /uploads route in index.ts.
 */
export const verifyUploadAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
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
        const filename = idOrFile ? path.basename(idOrFile) : "";
        if (filename) {
          const relPath = path.posix.join("uploads", "tasks", filename);
          const task = await prisma.task.findFirst({
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
          !!(await prisma.project.findFirst({
            where: { id: idNum, organizationId },
            select: { id: true },
          }));
        break;
      }
      case "inventory": {
        allowed =
          hasValidId &&
          !!(await prisma.inventoryItem.findFirst({
            where: { id: idNum, organizationId },
            select: { id: true },
          }));
        break;
      }
      case "procurement": {
        allowed =
          hasValidId &&
          !!(await prisma.procurementItem.findFirst({
            where: { id: idNum, organizationId },
            select: { id: true },
          }));
        break;
      }
      case "proforma-invoices": {
        allowed =
          hasValidId &&
          !!(await prisma.proformaInvoice.findFirst({
            where: { id: idNum, purchaseOrder: { organizationId } },
            select: { id: true },
          }));
        break;
      }
      case "customs": {
        allowed =
          hasValidId &&
          !!(await prisma.customs.findFirst({
            where: { id: idNum, shipment: { purchaseOrder: { organizationId } } },
            select: { id: true },
          }));
        break;
      }
      case "goods-receipts": {
        allowed =
          hasValidId &&
          !!(await prisma.goodsReceipt.findFirst({
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
  } catch (error) {
    console.error("Upload access check error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
