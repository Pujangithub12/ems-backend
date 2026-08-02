import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { roleHasPermission } from "../utils/permissionService";
import {
  AddPurchaseRequestDto,
  UpdatePurchaseRequestDto,
  ChangePurchaseRequestStatusDto,
  AddVendorQuoteDto,
  UpdateVendorQuoteDto,
  PurchaseRequestItemInput,
} from "../dto/purchaseRequest.dto";

/** Transitions that require the "projects.procurement" permission (i.e. an approver, not just the requester) — draft->submitted is the one transition any requester can make on their own request. */
const APPROVAL_STATUSES = new Set(["approved", "rejected"]);

const DETAIL_INCLUDE = {
  project: true,
  requestedBy: true,
  items: { include: { item: true } },
  vendorQuotes: { include: { vendor: true }, orderBy: { createdAt: "asc" as const } },
  purchaseOrder: true,
} as const;

/** Only these manual transitions are allowed via POST /purchase-requests/:id/status — "converted_to_po" is a side effect of generate-po, never set directly. */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
};

/** Resolves item-name/catalog-item pairs shared by create and update — prefers the catalog reference when given. */
async function resolveItemInputs(rawItems: PurchaseRequestItemInput[], organizationId: number) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("At least one item is required");
  }
  const resolved: {
    itemName: string;
    itemId: number | null;
    quantity: number;
    unit: string | null;
    estimatedPrice: number | null;
    notes: string | null;
  }[] = [];

  for (const raw of rawItems) {
    let catalogItem = null as Awaited<ReturnType<typeof prisma.catalogItem.findFirst>> | null;
    if (raw.itemId) {
      catalogItem = await prisma.catalogItem.findFirst({ where: { id: raw.itemId, organizationId } });
      if (!catalogItem) throw new Error("Selected item not found");
    }
    const itemName = catalogItem ? catalogItem.name : typeof raw.itemName === "string" ? raw.itemName.trim() : "";
    if (!itemName) throw new Error("Item name is required for every line item");

    resolved.push({
      itemName,
      itemId: catalogItem?.id ?? null,
      quantity: raw.quantity && raw.quantity > 0 ? Math.round(raw.quantity) : 1,
      unit: raw.unit ?? null,
      estimatedPrice: raw.estimatedPrice ?? null,
      notes: raw.notes ?? null,
    });
  }
  return resolved;
}

/** Purchase Request tab (procurement pipeline v2, step 1): PR -> Vendor Selection -> generate-po. */
export class PurchaseRequestController {
  /** GET /workspace/purchase-requests — aggregated across every project in the organization. */
  static getOrganizationPurchaseRequests = async (req: AuthRequest, res: Response) => {
    try {
      const requests = await prisma.purchaseRequest.findMany({
        where: { organizationId: req.organization!.id },
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ requests });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /projects/:projectId/purchase-requests — flat list for the project-scoped tab. */
  static getPurchaseRequests = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId: req.organization!.id },
      });
      if (!project) return res.status(404).json({ message: "Project not found" });

      const requests = await prisma.purchaseRequest.findMany({
        where: { projectId: project.id },
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ requests });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /projects/:projectId/purchase-requests — creates a draft PR with its line items. Open to any authenticated organization member (see routes.ts). */
  static addPurchaseRequest = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { department, priority, reason, items }: AddPurchaseRequestDto = req.body;

    try {
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId: req.organization!.id },
      });
      if (!project) return res.status(404).json({ message: "Project not found" });

      let resolvedItems;
      try {
        resolvedItems = await resolveItemInputs(items, req.organization!.id);
      } catch (validationError) {
        return res.status(400).json({ message: (validationError as Error).message });
      }

      const requestedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });

      const created = await prisma.purchaseRequest.create({
        data: {
          projectId: project.id,
          organizationId: req.organization!.id,
          status: "draft",
          ...(department ? { department } : {}),
          ...(priority ? { priority } : {}),
          ...(reason ? { reason } : {}),
          ...(requestedBy ? { requestedById: requestedBy.id } : {}),
          items: { create: resolvedItems },
        },
      });

      const prNumber = `PR-${String(created.id).padStart(6, "0")}`;
      await prisma.purchaseRequest.update({ where: { id: created.id }, data: { prNumber } });

      await prisma.purchaseRequestStatusHistory.create({
        data: {
          toStatus: "draft",
          purchaseRequestId: created.id,
          ...(requestedBy ? { changedById: requestedBy.id } : {}),
        },
      });

      const purchaseRequest = await prisma.purchaseRequest.findUnique({
        where: { id: created.id },
        include: DETAIL_INCLUDE,
      });

      return res.status(201).json({ message: "Purchase request created", purchaseRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  private static async loadOwnedRequest(id: string, organizationId: number) {
    const purchaseRequest = await prisma.purchaseRequest.findFirst({
      where: { id: parseInt(id) },
      include: DETAIL_INCLUDE,
    });
    if (!purchaseRequest || purchaseRequest.organizationId !== organizationId) return null;
    return purchaseRequest;
  }

  /** PUT /purchase-requests/:id — only while status is "draft". Open to any authenticated organization member. */
  static updatePurchaseRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { department, priority, reason, items }: UpdatePurchaseRequestDto = req.body;

    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });
      if (existing.status !== "draft") {
        return res.status(400).json({ message: "Only draft requests can be edited" });
      }

      const data: any = {};
      if (department !== undefined) data.department = department;
      if (priority !== undefined) data.priority = priority;
      if (reason !== undefined) data.reason = reason;

      if (items !== undefined) {
        let resolvedItems;
        try {
          resolvedItems = await resolveItemInputs(items, req.organization!.id);
        } catch (validationError) {
          return res.status(400).json({ message: (validationError as Error).message });
        }
        // Full-replace the line items, matching the codebase's existing full-replace convention for Schedule/Hierarchy.
        await prisma.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: existing.id } });
        data.items = { create: resolvedItems };
      }

      await prisma.purchaseRequest.update({ where: { id: existing.id }, data });

      const purchaseRequest = await prisma.purchaseRequest.findUnique({
        where: { id: existing.id },
        include: DETAIL_INCLUDE,
      });
      return res.status(200).json({ message: "Purchase request updated", purchaseRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /purchase-requests/:id — only while status is "draft" (submitted/approved/converted requests are kept for audit trail). Open to any authenticated organization member. */
  static deletePurchaseRequest = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });
      if (existing.status !== "draft") {
        return res.status(400).json({ message: "Only draft requests can be deleted" });
      }

      await prisma.purchaseRequest.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Purchase request deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * POST /purchase-requests/:id/status — draft->submitted->approved/rejected. Any authenticated
   * organization member may submit their own draft; moving a submitted request to approved/rejected
   * requires the "projects.procurement" permission (route itself is open — see routes.ts).
   */
  static changeStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status, notes }: ChangePurchaseRequestStatusDto = req.body;

    try {
      if (APPROVAL_STATUSES.has(status)) {
        const allowed = await roleHasPermission(req.user!.role, "projects.procurement");
        if (!allowed) {
          return res.status(403).json({ message: "Forbidden: Access denied" });
        }
      }

      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];
      if (!allowedNextStatuses.includes(status)) {
        return res.status(400).json({
          message: `Cannot move a ${existing.status} request to ${status}`,
        });
      }

      await prisma.purchaseRequest.update({ where: { id: existing.id }, data: { status } });

      const changedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
      await prisma.purchaseRequestStatusHistory.create({
        data: {
          fromStatus: existing.status,
          toStatus: status,
          purchaseRequestId: existing.id,
          ...(notes ? { notes } : {}),
          ...(changedBy ? { changedById: changedBy.id } : {}),
        },
      });

      const purchaseRequest = await prisma.purchaseRequest.findUnique({
        where: { id: existing.id },
        include: DETAIL_INCLUDE,
      });
      return res.status(200).json({ message: "Status updated", purchaseRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-requests/:id/vendor-quotes — add a "possible vendor" option. Admin-gated. */
  static addVendorQuote = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { vendorId, price, notes }: AddVendorQuoteDto = req.body;

    if (!vendorId || price === undefined || price === null) {
      return res.status(400).json({ message: "vendorId and price are required" });
    }

    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const vendor = await prisma.vendor.findFirst({
        where: { id: vendorId, organizationId: req.organization!.id },
      });
      if (!vendor) return res.status(400).json({ message: "Vendor not found" });

      const quote = await prisma.vendorQuote.create({
        data: {
          purchaseRequestId: existing.id,
          vendorId: vendor.id,
          price,
          ...(notes ? { notes } : {}),
        },
        include: { vendor: true },
      });

      return res.status(201).json({ message: "Vendor quote added", quote });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /purchase-requests/:id/vendor-quotes/:quoteId — admin-gated. */
  static updateVendorQuote = async (req: AuthRequest, res: Response) => {
    const { id, quoteId } = req.params;
    const { vendorId, price, notes }: UpdateVendorQuoteDto = req.body;

    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const quote = await prisma.vendorQuote.findFirst({
        where: { id: parseInt(quoteId as string), purchaseRequestId: existing.id },
      });
      if (!quote) return res.status(404).json({ message: "Vendor quote not found" });

      const data: any = {};
      if (price !== undefined) data.price = price;
      if (notes !== undefined) data.notes = notes;
      if (vendorId !== undefined) {
        const vendor = await prisma.vendor.findFirst({
          where: { id: vendorId, organizationId: req.organization!.id },
        });
        if (!vendor) return res.status(400).json({ message: "Vendor not found" });
        data.vendorId = vendor.id;
      }

      const updated = await prisma.vendorQuote.update({
        where: { id: quote.id },
        data,
        include: { vendor: true },
      });

      return res.status(200).json({ message: "Vendor quote updated", quote: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /purchase-requests/:id/vendor-quotes/:quoteId — admin-gated. */
  static deleteVendorQuote = async (req: AuthRequest, res: Response) => {
    const { id, quoteId } = req.params;
    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const quote = await prisma.vendorQuote.findFirst({
        where: { id: parseInt(quoteId as string), purchaseRequestId: existing.id },
      });
      if (!quote) return res.status(404).json({ message: "Vendor quote not found" });

      await prisma.vendorQuote.delete({ where: { id: quote.id } });
      return res.status(200).json({ message: "Vendor quote deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-requests/:id/vendor-quotes/:quoteId/select — marks this quote selected, unmarks every other quote on the same PR. Admin-gated. */
  static selectVendorQuote = async (req: AuthRequest, res: Response) => {
    const { id, quoteId } = req.params;
    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const quote = await prisma.vendorQuote.findFirst({
        where: { id: parseInt(quoteId as string), purchaseRequestId: existing.id },
      });
      if (!quote) return res.status(404).json({ message: "Vendor quote not found" });

      await prisma.$transaction([
        prisma.vendorQuote.updateMany({
          where: { purchaseRequestId: existing.id },
          data: { isSelected: false },
        }),
        prisma.vendorQuote.update({ where: { id: quote.id }, data: { isSelected: true } }),
      ]);

      const purchaseRequest = await prisma.purchaseRequest.findUnique({
        where: { id: existing.id },
        include: DETAIL_INCLUDE,
      });
      return res.status(200).json({ message: "Vendor selected", purchaseRequest });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * POST /purchase-requests/:id/generate-po — the "Generate Purchase Order" action from the
   * Vendor Selection screen. Requires an approved PR with exactly one selected vendor quote and
   * no existing PO. Snapshots the PR's line items onto the new PO (not a live reference) so the
   * PO stays stable if the PR is edited later. Admin-gated.
   */
  static generatePurchaseOrder = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      if (existing.status !== "approved") {
        return res.status(400).json({ message: "Purchase request must be approved before generating a purchase order" });
      }
      if (existing.purchaseOrder) {
        return res.status(400).json({ message: "A purchase order has already been generated for this request" });
      }
      const selectedQuote = existing.vendorQuotes.find((quote) => quote.isSelected);
      if (!selectedQuote) {
        return res.status(400).json({ message: "Select a vendor before generating a purchase order" });
      }

      const createdPo = await prisma.purchaseOrder.create({
        data: {
          purchaseRequestId: existing.id,
          vendorId: selectedQuote.vendorId,
          projectId: existing.projectId,
          organizationId: req.organization!.id,
          status: "created",
          items: {
            // The selected vendor quote's price is a single figure for the whole PR (one
            // vendor per PR, per the vendor-selection design) rather than a per-line-item
            // price, so each PO line item's unitPrice falls back to that item's own
            // estimatedPrice from the PR — the closest per-item cost signal available.
            create: existing.items.map((item) => ({
              itemName: item.itemName,
              itemId: item.itemId,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.estimatedPrice,
              notes: item.notes,
            })),
          },
        },
      });

      const poNumber = `PO-${String(createdPo.id).padStart(6, "0")}`;
      await prisma.purchaseOrder.update({ where: { id: createdPo.id }, data: { poNumber } });

      const changedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
      await prisma.purchaseOrderStatusHistory.create({
        data: {
          toStatus: "created",
          purchaseOrderId: createdPo.id,
          ...(changedBy ? { changedById: changedBy.id } : {}),
        },
      });

      await prisma.purchaseRequest.update({ where: { id: existing.id }, data: { status: "converted_to_po" } });
      await prisma.purchaseRequestStatusHistory.create({
        data: {
          fromStatus: "approved",
          toStatus: "converted_to_po",
          purchaseRequestId: existing.id,
          ...(changedBy ? { changedById: changedBy.id } : {}),
        },
      });

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: createdPo.id },
        include: { vendor: true, project: true, items: true, purchaseRequest: true },
      });

      // No PDF is generated here anymore — at this point most of what the PDF
      // needs (delivery address, payment terms, incoterms, shipping terms,
      // etc.) hasn't been filled in yet on the new PO, so an eagerly-rendered
      // snapshot would just be mostly blank. GET /purchase-orders/:id/pdf
      // renders it on demand, live from whatever's actually been filled in by
      // then — that's the only way a PO PDF gets created now.
      return res.status(201).json({ message: "Purchase order generated", purchaseOrder });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-requests/:itemId/attachments — upload a document (general/quotation/comparison_sheet). Admin-gated. Expects multer single("file") + body.documentType; route uses :itemId because uploadPurchaseRequestFile's multer destination reads req.params.itemId. */
  static addAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });
    const documentType = (req.body?.documentType as string) || "general";

    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(itemId as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const uploadedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });

      const attachment = await prisma.purchaseRequestAttachment.create({
        data: {
          fileName: file.originalname,
          filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
          documentType,
          purchaseRequestId: existing.id,
          ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
        },
      });

      return res.status(201).json({ message: "Attachment uploaded", attachment });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /purchase-requests/:itemId/attachments/:attachmentId — admin-gated. */
  static deleteAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId, attachmentId } = req.params;
    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(itemId as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const attachment = await prisma.purchaseRequestAttachment.findFirst({
        where: { id: parseInt(attachmentId as string), purchaseRequestId: existing.id },
      });
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });

      await prisma.purchaseRequestAttachment.delete({ where: { id: attachment.id } });
      return res.status(200).json({ message: "Attachment deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /purchase-requests/:id/detail — everything the Vendor Selection / PR detail screen needs. */
  static getPurchaseRequestDetail = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await PurchaseRequestController.loadOwnedRequest(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase request not found" });

      const [statusHistory, attachments] = await Promise.all([
        prisma.purchaseRequestStatusHistory.findMany({
          where: { purchaseRequestId: existing.id },
          include: { changedBy: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.purchaseRequestAttachment.findMany({
          where: { purchaseRequestId: existing.id },
          include: { uploadedBy: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return res.status(200).json({ purchaseRequest: existing, statusHistory, attachments });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
