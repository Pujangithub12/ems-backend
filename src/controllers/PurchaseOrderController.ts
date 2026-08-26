import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { roleHasPermission } from "../utils/permissionService";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  DecidePurchaseOrderApprovalDto,
} from "../dto/purchaseOrder.dto";
import { computeCostSheet } from "../utils/costSheet";
import { buildPurchaseOrderPdf } from "../utils/purchaseOrderPdf";
import { currentNepaliFiscalYearLabel } from "../utils/nepaliFiscalYear";
import { downloadFileFromStorage } from "../config/supabaseStorage";

const PDF_INCLUDE = { vendor: true, organization: true, items: { include: { item: true } } } as const;

const LIST_INCLUDE = {
  vendor: true,
  project: true,
  items: true,
  approvedBy: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  shipment: { select: { status: true } },
} as const;

const DETAIL_INCLUDE = {
  vendor: true,
  project: true,
  approvedBy: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  items: { include: { item: true } },
  statusHistory: { include: { changedBy: true }, orderBy: { createdAt: "desc" as const } },
  proformaInvoices: { include: { items: true }, orderBy: { createdAt: "desc" as const } },
  shipment: { include: { insurance: true, customs: { include: { documents: true } } } },
  goodsReceipts: {
    include: { items: true, photos: true, warehouse: true, receivedBy: true },
    orderBy: { createdAt: "desc" as const },
  },
} as const;

/** Purchase Order tab (procurement pipeline v2, step 3): created directly via createPurchaseOrder, then read/updated/tracked here through PI/Shipment/GRN. */
export class PurchaseOrderController {
  /** GET /workspace/purchase-orders — aggregated across every project in the organization.
   * A plain admin only sees POs they created themselves; finance/super_admin see everything
   * (they review POs created by others in the Purchase Approval tab). */
  static getOrganizationPurchaseOrders = async (req: AuthRequest, res: Response) => {
    try {
      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
          organizationId: req.organization!.id,
          ...(req.user!.role === UserRole.ADMIN ? { createdById: req.user!.id } : {}),
        },
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ purchaseOrders });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /projects/:projectId/purchase-orders — flat list for the project-scoped tab. Same
   * creator-scoping for plain admins as getOrganizationPurchaseOrders. */
  static getPurchaseOrders = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    try {
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId: req.organization!.id },
      });
      if (!project) return res.status(404).json({ message: "Project not found" });

      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
          projectId: project.id,
          ...(req.user!.role === UserRole.ADMIN ? { createdById: req.user!.id } : {}),
        },
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ purchaseOrders });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** Next incremental number for the current Nepali fiscal year, scoped to the organization —
   * looks at existing `{number}-{fiscalYear}` PO numbers for that fiscal year and takes the
   * highest + 1 (starting at 1). A manually-edited poNumber that doesn't match the pattern is
   * ignored rather than breaking the count. */
  private static async nextPoNumber(organizationId: number): Promise<string> {
    const fiscalYear = currentNepaliFiscalYearLabel();
    const suffix = `-${fiscalYear}`;
    const candidates = await prisma.purchaseOrder.findMany({
      where: { organizationId, poNumber: { endsWith: suffix } },
      select: { poNumber: true },
    });
    const pattern = new RegExp(`^(\\d+)${suffix.replace(/\//g, "\\/")}$`);
    let maxNumber = 0;
    for (const { poNumber } of candidates) {
      const match = poNumber?.match(pattern);
      if (match) maxNumber = Math.max(maxNumber, parseInt(match[1]!, 10));
    }
    return `${maxNumber + 1}-${fiscalYear}`;
  }

  /** POST /projects/:projectId/purchase-orders — creates a PO directly (vendor + items picked up
   * front), no Purchase Request involved. poNumber is auto-generated as "{number}-{nepali fiscal
   * year}" (e.g. "1-83/84"), incrementing per organization per fiscal year — still editable
   * afterward via updatePurchaseOrder, which enforces uniqueness on manual edits. */
  static createPurchaseOrder = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { vendorId, items }: CreatePurchaseOrderDto = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required" });
    }
    for (const item of items) {
      if (!item || typeof item.itemName !== "string" || !item.itemName.trim()) {
        return res.status(400).json({ message: "Every item needs a name" });
      }
    }

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId },
      });
      if (!project) return res.status(404).json({ message: "Project not found" });

      const poNumber = await PurchaseOrderController.nextPoNumber(organizationId);

      const createdPo = await prisma.purchaseOrder.create({
        data: {
          organizationId,
          projectId: project.id,
          vendorId: vendorId ?? null,
          createdById: req.user!.id,
          poNumber,
          status: "created",
          items: {
            create: items.map((item) => ({
              itemName: item.itemName.trim(),
              itemId: item.itemId ?? null,
              quantity: item.quantity ?? 1,
              unit: item.unit ?? null,
              unitPrice: item.unitPrice ?? null,
              notes: item.notes ?? null,
            })),
          },
        },
      });

      const changedBy = await prisma.user.findUnique({ where: { id: req.user!.id } });
      await prisma.purchaseOrderStatusHistory.create({
        data: {
          toStatus: "created",
          purchaseOrderId: createdPo.id,
          ...(changedBy ? { changedById: changedBy.id } : {}),
        },
      });

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: createdPo.id },
        include: { vendor: true, project: true, items: true },
      });

      return res.status(201).json({ message: "Purchase order created", purchaseOrder });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  private static async loadOwnedPurchaseOrder(id: string, organizationId: number) {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id: parseInt(id) },
    });
    if (!purchaseOrder || purchaseOrder.organizationId !== organizationId) return null;
    return purchaseOrder;
  }

  /** A plain admin may only see/act on POs they created themselves — finance/super_admin (and
   * anyone else who reaches these routes) see everything, since finance needs to review POs
   * created by others. Used everywhere loadOwnedPurchaseOrder gates access to a specific PO. */
  private static isVisibleTo(purchaseOrder: { createdById: number | null }, req: AuthRequest) {
    if (req.user!.role !== UserRole.ADMIN) return true;
    return purchaseOrder.createdById === req.user!.id;
  }

  /** GET /purchase-orders/:id/detail — everything the PO detail screen needs across the whole downstream pipeline. */
  static getPurchaseOrderDetail = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const owned = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!owned || !PurchaseOrderController.isVisibleTo(owned, req)) {
        return res.status(404).json({ message: "Purchase order not found" });
      }

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: owned.id },
        include: DETAIL_INCLUDE,
      });

      return res.status(200).json({ purchaseOrder });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /purchase-orders/:id — update terms/delivery/status fields. Any status change is
   * allowed here (no strict transition machine) except that `status` can't move past "created"
   * until approvalStatus is "approved" (see the guard below). Reachable by anyone holding the
   * "projects.procurement" permission (admin/super_admin by default) plus finance/super_admin
   * unconditionally — finance needs to edit a PO while reviewing it for approval without being
   * granted the broader procurement permission (attachments/cost-sheet, etc. stay off-limits). */
  static updatePurchaseOrder = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      poNumber,
      paymentTerms,
      incoterms,
      taxPercent,
      terms,
      deliveryPeriod,
      finalDestination,
      customerContactPerson,
      currency,
      purchaseType,
      status,
      items,
    }: UpdatePurchaseOrderDto = req.body;

    try {
      const canEdit =
        (await roleHasPermission(req.user!.role, "projects.procurement")) ||
        req.user!.role === UserRole.FINANCE ||
        req.user!.role === UserRole.SUPER_ADMIN;
      if (!canEdit) return res.status(403).json({ message: "Forbidden" });

      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
        return res.status(404).json({ message: "Purchase order not found" });
      }

      if (status !== undefined && status !== "created" && existing.approvalStatus !== "approved") {
        return res.status(400).json({ message: "Purchase order must be approved before its status can change" });
      }

      const previousStatus = existing.status;
      const data: any = {};

      if (poNumber !== undefined) {
        const trimmed = poNumber.trim();
        if (!trimmed) {
          return res.status(400).json({ message: "PO number cannot be empty" });
        }
        const duplicate = await prisma.purchaseOrder.findFirst({
          where: { poNumber: trimmed, organizationId: req.organization!.id, NOT: { id: existing.id } },
        });
        if (duplicate) {
          return res.status(400).json({ message: `PO number "${trimmed}" is already in use by another purchase order` });
        }
        data.poNumber = trimmed;
      }
      if (paymentTerms !== undefined) data.paymentTerms = paymentTerms;
      if (incoterms !== undefined) data.incoterms = incoterms;
      if (taxPercent !== undefined) data.taxPercent = taxPercent;
      if (terms !== undefined) data.terms = terms;
      if (deliveryPeriod !== undefined) data.deliveryPeriod = deliveryPeriod;
      if (finalDestination !== undefined) data.finalDestination = finalDestination;
      if (customerContactPerson !== undefined) data.customerContactPerson = customerContactPerson;
      if (currency !== undefined) data.currency = currency;
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
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-orders/:id/approval — the approve/reject decision itself. Deliberately
   * narrower than "projects.procurement": only finance or super_admin may decide (a plain admin
   * can edit a PO via updatePurchaseOrder above, but can't approve/reject it) — mirrors
   * ExpenseRequestController.updateStatus's finance cross-cutting-approval carve-out. */
  static decidePurchaseOrderApproval = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { decision }: DecidePurchaseOrderApprovalDto = req.body;

    if (req.user!.role !== UserRole.FINANCE && req.user!.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ message: "Only finance or a super admin can approve or reject a purchase order" });
    }
    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({ message: "Invalid decision" });
    }

    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Purchase order not found" });
      if (existing.approvalStatus !== "pending_approval") {
        return res.status(400).json({ message: "This purchase order has already been decided" });
      }

      await prisma.purchaseOrder.update({
        where: { id: existing.id },
        data: { approvalStatus: decision, approvedById: req.user!.id, approvedAt: new Date() },
      });

      await prisma.purchaseOrderStatusHistory.create({
        data: {
          fromStatus: existing.status,
          toStatus: decision,
          purchaseOrderId: existing.id,
          changedById: req.user!.id,
        },
      });

      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: existing.id },
        include: DETAIL_INCLUDE,
      });

      return res.status(200).json({ message: `Purchase order ${decision}`, purchaseOrder });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /purchase-orders/:id/pdf — renders the PO on demand and streams it back as an
   * attachment (forces a download rather than an inline view). Always regenerated live from
   * current data rather than any stored snapshot, so edits made afterward (HSN codes, shipping
   * terms, etc.) show up the next time someone downloads it.
   */
  static downloadPdf = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      if (existing.approvalStatus !== "approved") {
        return res.status(403).json({ message: "Purchase order must be approved before its PDF can be downloaded" });
      }

      const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: existing.id }, include: PDF_INCLUDE });
      if (!purchaseOrder) return res.status(404).json({ message: "Purchase order not found" });

      // A missing/unreadable letterhead image shouldn't block PDF generation — the template
      // just falls back to a blank signature line.
      const loadOrgImage = async (key: string | null | undefined) => {
        if (!key) return null;
        try {
          return await downloadFileFromStorage(key);
        } catch (error) {
          console.error(`Failed to load organization letterhead image "${key}":`, error);
          return null;
        }
      };
      const [signatureImage, stampImage] = await Promise.all([
        loadOrgImage(purchaseOrder.organization?.signatureImagePath),
        loadOrgImage(purchaseOrder.organization?.stampImagePath),
      ]);

      const doc = buildPurchaseOrderPdf({
        poNumber: purchaseOrder.poNumber,
        createdAt: purchaseOrder.createdAt,
        paymentTerms: purchaseOrder.paymentTerms,
        incoterms: purchaseOrder.incoterms,
        taxPercent: purchaseOrder.taxPercent,
        terms: purchaseOrder.terms,
        deliveryPeriod: purchaseOrder.deliveryPeriod,
        finalDestination: purchaseOrder.finalDestination,
        customerContactPerson: purchaseOrder.customerContactPerson,
        currency: purchaseOrder.currency,
        organizationName: purchaseOrder.organization?.name ?? null,
        organizationAddress: purchaseOrder.organization?.address ?? null,
        organizationContact: purchaseOrder.organization?.contact ?? null,
        organizationEmail: purchaseOrder.organization?.email ?? null,
        organizationWebsite: purchaseOrder.organization?.website ?? null,
        signatureImage,
        stampImage,
        vendor: purchaseOrder.vendor,
        items: purchaseOrder.items.map((item) => ({ ...item, description: item.item?.description ?? null })),
      });

      // poNumber can contain "/" (e.g. "1-83/84" — incremental number + Nepali fiscal year),
      // which isn't safe inside a Content-Disposition filename, so swap it for "-" there only.
      const downloadName = (purchaseOrder.poNumber || `PO-${purchaseOrder.id}`).replace(/\//g, "-");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}.pdf"`);
      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /purchase-orders/:id/cost-sheet — spec section 9's landed-cost breakdown, always computed on the fly. */
  static getCostSheet = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id as string, req.organization!.id);
      if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
        return res.status(404).json({ message: "Purchase order not found" });
      }

      const costSheet = await computeCostSheet(existing.id);
      return res.status(200).json({ costSheet });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

}
