import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UpdatePurchaseOrderDto } from "../dto/purchaseOrder.dto";
import { computeCostSheet } from "../utils/costSheet";
import { buildPurchaseOrderPdf } from "../utils/purchaseOrderPdf";

const PDF_INCLUDE = { vendor: true, organization: true, items: true } as const;

const LIST_INCLUDE = {
  vendor: true,
  project: true,
  items: true,
  shipment: { select: { status: true } },
} as const;

const DETAIL_INCLUDE = {
  vendor: true,
  project: true,
  purchaseRequest: true,
  items: { include: { item: true } },
  attachments: { include: { uploadedBy: true } },
  statusHistory: { include: { changedBy: true }, orderBy: { createdAt: "desc" as const } },
  proformaInvoices: { include: { items: true }, orderBy: { createdAt: "desc" as const } },
  shipment: { include: { insurance: true, customs: { include: { documents: true } } } },
  goodsReceipts: {
    include: { items: true, photos: true, warehouse: true, receivedBy: true },
    orderBy: { createdAt: "desc" as const },
  },
} as const;

/** Purchase Order tab (procurement pipeline v2, step 3): created via PurchaseRequestController.generatePurchaseOrder, then read/updated/tracked here through PI/Shipment/GRN. */
export class PurchaseOrderController {
  /** GET /workspace/purchase-orders — aggregated across every project in the organization. */
  static getOrganizationPurchaseOrders = async (req: AuthRequest, res: Response) => {
    try {
      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: { organizationId: req.organization!.id },
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ purchaseOrders });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /projects/:projectId/purchase-orders — flat list for the project-scoped tab. */
  static getPurchaseOrders = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId: req.organization!.id },
      });
      if (!project) return res.status(404).json({ message: "Project not found" });

      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: { projectId: project.id },
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ purchaseOrders });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  private static async loadOwnedPurchaseOrder(id: string, organizationId: number) {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id: parseInt(id) },
    });
    if (!purchaseOrder || purchaseOrder.organizationId !== organizationId) return null;
    return purchaseOrder;
  }

  /** GET /purchase-orders/:id/detail — everything the PO detail screen needs across the whole downstream pipeline. */
  static getPurchaseOrderDetail = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const owned = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!owned) return res.status(404).json({ message: "Purchase order not found" });

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: owned.id },
        include: DETAIL_INCLUDE,
      });

      return res.status(200).json({ purchaseOrder });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** PUT /purchase-orders/:id — update terms/delivery/status fields. Any status change is allowed here (no strict transition machine, unlike PurchaseRequestController). Admin-gated. */
  static updatePurchaseOrder = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      deliveryAddress,
      paymentTerms,
      deliveryDate,
      incoterms,
      taxPercent,
      terms,
      shippingTerms,
      deliveryPeriod,
      finalDestination,
      purchaseType,
      status,
      items,
    }: UpdatePurchaseOrderDto = req.body;

    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase order not found" });

      const previousStatus = existing.status;
      const data: any = {};

      if (deliveryAddress !== undefined) data.deliveryAddress = deliveryAddress;
      if (paymentTerms !== undefined) data.paymentTerms = paymentTerms;
      if (deliveryDate !== undefined) data.deliveryDate = deliveryDate ? new Date(deliveryDate) : null;
      if (incoterms !== undefined) data.incoterms = incoterms;
      if (taxPercent !== undefined) data.taxPercent = taxPercent;
      if (terms !== undefined) data.terms = terms;
      if (shippingTerms !== undefined) data.shippingTerms = shippingTerms;
      if (deliveryPeriod !== undefined) data.deliveryPeriod = deliveryPeriod;
      if (finalDestination !== undefined) data.finalDestination = finalDestination;
      if (purchaseType !== undefined) data.purchaseType = purchaseType;
      if (status !== undefined) data.status = status;

      await prisma.purchaseOrder.update({ where: { id: existing.id }, data });

      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item || typeof item.id !== "number") continue;
          await prisma.purchaseOrderItem.updateMany({
            where: { id: item.id, purchaseOrderId: existing.id },
            data: { hsnCode: item.hsnCode ?? null },
          });
        }
      }

      if (status !== undefined && status !== previousStatus) {
        const changedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
        await prisma.purchaseOrderStatusHistory.create({
          data: {
            fromStatus: previousStatus,
            toStatus: status,
            purchaseOrderId: existing.id,
            ...(changedBy ? { changedById: changedBy.id } : {}),
          },
        });
      }

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: existing.id },
        include: { vendor: true, project: true },
      });

      return res.status(200).json({ message: "Purchase order updated", purchaseOrder });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /**
   * GET /purchase-orders/:id/pdf — renders the PO on demand and streams it back as an
   * attachment (forces a download rather than an inline view). Always regenerated live from
   * current data rather than served from the stored snapshot (see generatePurchaseOrder's
   * PurchaseOrderAttachment, which is a point-in-time copy for the audit trail) so edits made
   * afterward (HSN codes, shipping terms, etc.) show up the next time someone downloads it.
   */
  static downloadPdf = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase order not found" });

      const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: existing.id }, include: PDF_INCLUDE });
      if (!purchaseOrder) return res.status(404).json({ message: "Purchase order not found" });

      const doc = buildPurchaseOrderPdf({
        poNumber: purchaseOrder.poNumber,
        createdAt: purchaseOrder.createdAt,
        deliveryAddress: purchaseOrder.deliveryAddress,
        paymentTerms: purchaseOrder.paymentTerms,
        deliveryDate: purchaseOrder.deliveryDate,
        incoterms: purchaseOrder.incoterms,
        taxPercent: purchaseOrder.taxPercent,
        terms: purchaseOrder.terms,
        shippingTerms: purchaseOrder.shippingTerms,
        deliveryPeriod: purchaseOrder.deliveryPeriod,
        finalDestination: purchaseOrder.finalDestination,
        organizationName: purchaseOrder.organization?.name ?? null,
        organizationAddress: purchaseOrder.organization?.address ?? null,
        organizationContact: purchaseOrder.organization?.contact ?? null,
        organizationEmail: purchaseOrder.organization?.email ?? null,
        organizationWebsite: purchaseOrder.organization?.website ?? null,
        vendor: purchaseOrder.vendor,
        items: purchaseOrder.items,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${purchaseOrder.poNumber || `PO-${purchaseOrder.id}`}.pdf"`);
      doc.pipe(res);
      doc.end();
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /purchase-orders/:id/cost-sheet — spec section 9's landed-cost breakdown, always computed on the fly. */
  static getCostSheet = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase order not found" });

      const costSheet = await computeCostSheet(existing.id);
      return res.status(200).json({ costSheet });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /purchase-orders/:itemId/attachments — upload a document. Admin-gated. Expects multer single("file"); route must use :itemId (multer destination reads req.params.itemId). */
  static addAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });

    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(itemId as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase order not found" });

      const uploadedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });

      const attachment = await prisma.purchaseOrderAttachment.create({
        data: {
          fileName: file.originalname,
          filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
          purchaseOrderId: existing.id,
          ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
        },
      });

      return res.status(201).json({ message: "Attachment uploaded", attachment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /purchase-orders/:itemId/attachments/:attachmentId — admin-gated. */
  static deleteAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId, attachmentId } = req.params;
    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(itemId as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase order not found" });

      const attachment = await prisma.purchaseOrderAttachment.findFirst({
        where: { id: parseInt(attachmentId as string), purchaseOrderId: existing.id },
      });
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });

      await prisma.purchaseOrderAttachment.delete({ where: { id: attachment.id } });
      return res.status(200).json({ message: "Attachment deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
