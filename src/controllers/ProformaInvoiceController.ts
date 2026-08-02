import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import {
  AddProformaInvoiceDto,
  UpdateProformaInvoiceDto,
  ProformaInvoiceItemInput,
} from "../dto/proformaInvoice.dto";
import { ProformaInvoiceStatus } from "../types/domain";

const DETAIL_INCLUDE = {
  purchaseOrder: true,
  items: { include: { item: true } },
} as const;

const LIST_INCLUDE = {
  purchaseOrder: { include: { vendor: true, project: true } },
  items: true,
} as const;

/** Resolves item-name/catalog-item pairs for a proforma invoice's line items — prefers the catalog reference when given, same pattern as PurchaseRequestController.resolveItemInputs. Tolerates an empty/undefined list. */
async function resolveItemInputs(rawItems: ProformaInvoiceItemInput[] | undefined, organizationId: number) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }
  const resolved: {
    itemName: string;
    itemId: number | null;
    quantity: number;
    unit: string | null;
    unitPrice: number | null;
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
      unitPrice: raw.unitPrice ?? null,
    });
  }
  return resolved;
}

/** Proforma Invoice (procurement pipeline v2, step 4): PurchaseOrder -> ProformaInvoice -> Shipment/Insurance/Customs. */
export class ProformaInvoiceController {
  private static async loadOwnedProformaInvoice(id: string, organizationId: number) {
    const proformaInvoice = await prisma.proformaInvoice.findFirst({
      where: { id: parseInt(id) },
      include: DETAIL_INCLUDE,
    });
    if (!proformaInvoice || proformaInvoice.purchaseOrder?.organizationId !== organizationId) return null;
    return proformaInvoice;
  }

  /** GET /workspace/proforma-invoices — every proforma invoice across every purchase order in the organization, for the sidebar Proforma Invoices page. */
  static getAllProformaInvoices = async (req: AuthRequest, res: Response) => {
    try {
      const proformaInvoices = await prisma.proformaInvoice.findMany({
        where: { purchaseOrder: { organizationId: req.organization!.id } },
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ proformaInvoices });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-orders/:id/proforma-invoices — creates a proforma invoice for a purchase order with its line items. Admin-gated (see routes.ts). */
  static addProformaInvoice = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { piNumber, piDate, currency, exchangeRate, paymentTerms, validityDate, items }: AddProformaInvoiceDto =
      req.body;

    try {
      const purchaseOrder = await prisma.purchaseOrder.findFirst({
        where: { id: parseInt(id as string), organizationId: req.organization!.id },
      });
      if (!purchaseOrder) return res.status(404).json({ message: "Purchase order not found" });

      let resolvedItems;
      try {
        resolvedItems = await resolveItemInputs(items, req.organization!.id);
      } catch (validationError) {
        return res.status(400).json({ message: (validationError as Error).message });
      }

      const created = await prisma.proformaInvoice.create({
        data: {
          purchaseOrderId: purchaseOrder.id,
          currency: currency ?? "NPR",
          exchangeRate: exchangeRate ?? 1,
          ...(piNumber ? { piNumber } : {}),
          ...(piDate ? { piDate: new Date(piDate) } : {}),
          ...(paymentTerms ? { paymentTerms } : {}),
          ...(validityDate ? { validityDate: new Date(validityDate) } : {}),
          items: { create: resolvedItems },
        },
      });

      const generatedPiNumber = `PI-${String(created.id).padStart(6, "0")}`;
      await prisma.proformaInvoice.update({ where: { id: created.id }, data: { piNumber: generatedPiNumber } });

      const proformaInvoice = await prisma.proformaInvoice.findUnique({
        where: { id: created.id },
        include: { items: true },
      });

      return res.status(201).json({ message: "Proforma invoice created", proformaInvoice });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /proforma-invoices/:id — update fields and/or full-replace line items. Admin-gated. */
  static updateProformaInvoice = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { piNumber, piDate, currency, exchangeRate, paymentTerms, validityDate, status, items }: UpdateProformaInvoiceDto =
      req.body;

    try {
      const existing = await ProformaInvoiceController.loadOwnedProformaInvoice(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Proforma invoice not found" });

      const data: any = {};
      if (piNumber !== undefined) data.piNumber = piNumber;
      if (currency !== undefined) data.currency = currency;
      if (exchangeRate !== undefined) data.exchangeRate = exchangeRate;
      if (paymentTerms !== undefined) data.paymentTerms = paymentTerms;
      if (status !== undefined) data.status = status;
      if (piDate !== undefined) data.piDate = piDate ? new Date(piDate) : null;
      if (validityDate !== undefined) data.validityDate = validityDate ? new Date(validityDate) : null;

      if (items !== undefined) {
        let resolvedItems;
        try {
          resolvedItems = await resolveItemInputs(items, req.organization!.id);
        } catch (validationError) {
          return res.status(400).json({ message: (validationError as Error).message });
        }
        // Full-replace the line items, matching PurchaseRequestController's full-replace convention.
        await prisma.proformaInvoiceItem.deleteMany({ where: { proformaInvoiceId: existing.id } });
        data.items = { create: resolvedItems };
      }

      await prisma.proformaInvoice.update({ where: { id: existing.id }, data });

      const proformaInvoice = await prisma.proformaInvoice.findUnique({
        where: { id: existing.id },
        include: DETAIL_INCLUDE,
      });
      return res.status(200).json({ message: "Proforma invoice updated", proformaInvoice });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /proforma-invoices/:id — admin-gated. */
  static deleteProformaInvoice = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await ProformaInvoiceController.loadOwnedProformaInvoice(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Proforma invoice not found" });

      await prisma.proformaInvoice.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Proforma invoice deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /proforma-invoices/:id/status — waiting/approved/rejected, settable directly (no transition machine). Admin-gated. */
  static changeStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status }: { status: ProformaInvoiceStatus } = req.body;

    try {
      const existing = await ProformaInvoiceController.loadOwnedProformaInvoice(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Proforma invoice not found" });

      await prisma.proformaInvoice.update({ where: { id: existing.id }, data: { status } });

      const proformaInvoice = await prisma.proformaInvoice.findUnique({
        where: { id: existing.id },
        include: DETAIL_INCLUDE,
      });
      return res.status(200).json({ message: "Status updated", proformaInvoice });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /proforma-invoices/:itemId/attachment — upload the single PI PDF, overwriting any previous file. Admin-gated. Expects multer single("file"); route param is :itemId because uploadProformaInvoiceFile's destination callback reads req.params.itemId. */
  static addAttachment = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });

    try {
      const existing = await ProformaInvoiceController.loadOwnedProformaInvoice(itemId as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Proforma invoice not found" });

      const proformaInvoice = await prisma.proformaInvoice.update({
        where: { id: existing.id },
        data: {
          fileName: file.originalname,
          filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
        },
      });

      return res.status(200).json({ message: "Attachment uploaded", proformaInvoice });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
