import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { AddQuotationDto, UpdateQuotationDto, QuotationItemInput } from "../dto/quotation.dto";
import { buildQuotationPdf } from "../utils/quotationPdf";
import { downloadFileFromStorageCached } from "../config/supabaseStorage";
import { currentNepaliFiscalYearLabel } from "../utils/nepaliFiscalYear";

const DETAIL_INCLUDE = { items: true } as const;

/** "007-83/84" — matches the reference paper quotation's numbering scheme. */
const QUOTE_NUMBER_RE = /^(\d+)-(\d{2}\/\d{2})$/;

/** Next default Quotation Number for an organization: <n+1>-<fiscal year>, 3-digit zero-padded,
 * where <fiscal year> is the current Nepali fiscal year (e.g. "83/84") and n is the highest
 * sequence number found among the organization's existing quotations FOR THAT SAME fiscal year
 * (anything from a past fiscal year, or not matching this shape at all — e.g. a fully custom
 * number — is ignored for this, so the count naturally restarts at 001 each new fiscal year).
 * Respects manual edits, since an edited value is picked up here the same way as a previously
 * auto-generated one — mirrors ProformaInvoiceController.nextPiNumber. */
async function nextQuotationNumber(organizationId: number): Promise<string> {
  const fiscalYear = currentNepaliFiscalYearLabel();
  const rows = await prisma.quotation.findMany({
    where: { organizationId, quotationNumber: { not: null } },
    select: { quotationNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const match = row.quotationNumber?.match(QUOTE_NUMBER_RE);
    if (match && match[2] === fiscalYear) max = Math.max(max, parseInt(match[1]!, 10));
  }
  return `${String(max + 1).padStart(3, "0")}-${fiscalYear}`;
}

/** Validates/normalizes raw line-item input — no catalog linking (unlike Proforma Invoice items),
 * since a quotation's items are typically one-off product descriptions, not shared catalog SKUs. */
function resolveItemInputs(rawItems: QuotationItemInput[] | undefined): { itemName: string; description: string | null; quantity: number; unit: string | null; rate: number | null }[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  const resolved: { itemName: string; description: string | null; quantity: number; unit: string | null; rate: number | null }[] = [];
  for (const raw of rawItems) {
    const itemName = typeof raw.itemName === "string" ? raw.itemName.trim() : "";
    if (!itemName) throw new Error("Item name is required for every line item");
    resolved.push({
      itemName,
      description: raw.description?.trim() || null,
      quantity: raw.quantity && raw.quantity > 0 ? raw.quantity : 1,
      unit: raw.unit?.trim() || null,
      rate: raw.rate ?? null,
    });
  }
  return resolved;
}

/** Quotations: standalone price quotations sent to prospective customers, right below Proforma
 * Invoices in the sidebar (spec: "Quotations" link) — no purchase order behind them. */
export class QuotationController {
  private static async loadOwnedQuotation(id: string, organizationId: number) {
    const quotation = await prisma.quotation.findFirst({ where: { id: parseInt(id) }, include: DETAIL_INCLUDE });
    if (!quotation || quotation.organizationId !== organizationId) return null;
    return quotation;
  }

  /** GET /workspace/quotations */
  static getAllQuotations = async (req: AuthRequest, res: Response) => {
    try {
      const quotations = await prisma.quotation.findMany({
        where: { organizationId: req.organization!.id },
        include: DETAIL_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return res.status(200).json({ quotations });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/quotations */
  static addQuotation = async (req: AuthRequest, res: Response) => {
    const {
      quotationNumber,
      quotationDate,
      title,
      currency,
      fromPan,
      regNo,
      customerName,
      customerAddress,
      customerContact,
      customerEmail,
      customerPan,
      priceBasis,
      deliveryPeriod,
      deliveryAddress,
      paymentTerms,
      validityPeriod,
      taxPercent,
      signatoryName,
      signatoryDesignation,
      items,
    }: AddQuotationDto = req.body;

    if (!customerName?.trim()) {
      return res.status(400).json({ message: "Enter the customer name" });
    }

    try {
      let resolvedItems;
      try {
        resolvedItems = resolveItemInputs(items);
      } catch (validationError) {
        return res.status(400).json({ message: (validationError as Error).message });
      }
      if (resolvedItems.length === 0) {
        return res.status(400).json({ message: "Add at least one item" });
      }

      const finalQuotationNumber = quotationNumber?.trim() || (await nextQuotationNumber(req.organization!.id));

      const created = await prisma.quotation.create({
        data: {
          organizationId: req.organization!.id,
          createdById: req.user!.id,
          quotationNumber: finalQuotationNumber,
          quotationDate: quotationDate ? new Date(quotationDate) : new Date(),
          ...(title ? { title } : {}),
          currency: currency ?? "NPR",
          ...(fromPan ? { fromPan } : {}),
          ...(regNo ? { regNo } : {}),
          customerName: customerName.trim(),
          ...(customerAddress ? { customerAddress } : {}),
          ...(customerContact ? { customerContact } : {}),
          ...(customerEmail ? { customerEmail } : {}),
          ...(customerPan ? { customerPan } : {}),
          ...(priceBasis ? { priceBasis } : {}),
          ...(deliveryPeriod ? { deliveryPeriod } : {}),
          ...(deliveryAddress ? { deliveryAddress } : {}),
          ...(paymentTerms ? { paymentTerms } : {}),
          ...(validityPeriod ? { validityPeriod } : {}),
          ...(taxPercent !== undefined ? { taxPercent } : {}),
          ...(signatoryName ? { signatoryName } : {}),
          ...(signatoryDesignation ? { signatoryDesignation } : {}),
          items: { create: resolvedItems },
        },
      });

      const quotation = await prisma.quotation.findUnique({ where: { id: created.id }, include: DETAIL_INCLUDE });
      return res.status(201).json({ message: "Quotation created", quotation });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /quotations/:id — update fields and/or full-replace line items. */
  static updateQuotation = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      quotationNumber,
      quotationDate,
      title,
      fromPan,
      currency,
      regNo,
      customerName,
      customerAddress,
      customerContact,
      customerEmail,
      customerPan,
      priceBasis,
      deliveryPeriod,
      deliveryAddress,
      paymentTerms,
      validityPeriod,
      taxPercent,
      signatoryName,
      signatoryDesignation,
      items,
    }: UpdateQuotationDto = req.body;

    try {
      const existing = await QuotationController.loadOwnedQuotation(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Quotation not found" });

      const data: any = {};
      if (quotationNumber !== undefined) data.quotationNumber = quotationNumber;
      if (quotationDate !== undefined) data.quotationDate = quotationDate ? new Date(quotationDate) : null;
      if (title !== undefined) data.title = title;
      if (currency !== undefined) data.currency = currency;
      if (fromPan !== undefined) data.fromPan = fromPan;
      if (regNo !== undefined) data.regNo = regNo;
      if (customerName !== undefined) {
        if (!customerName?.trim()) return res.status(400).json({ message: "Customer name cannot be empty" });
        data.customerName = customerName.trim();
      }
      if (customerAddress !== undefined) data.customerAddress = customerAddress;
      if (customerContact !== undefined) data.customerContact = customerContact;
      if (customerEmail !== undefined) data.customerEmail = customerEmail;
      if (customerPan !== undefined) data.customerPan = customerPan;
      if (priceBasis !== undefined) data.priceBasis = priceBasis;
      if (deliveryPeriod !== undefined) data.deliveryPeriod = deliveryPeriod;
      if (deliveryAddress !== undefined) data.deliveryAddress = deliveryAddress;
      if (paymentTerms !== undefined) data.paymentTerms = paymentTerms;
      if (validityPeriod !== undefined) data.validityPeriod = validityPeriod;
      if (taxPercent !== undefined) data.taxPercent = taxPercent;
      if (signatoryName !== undefined) data.signatoryName = signatoryName;
      if (signatoryDesignation !== undefined) data.signatoryDesignation = signatoryDesignation;

      if (items !== undefined) {
        let resolvedItems;
        try {
          resolvedItems = resolveItemInputs(items);
        } catch (validationError) {
          return res.status(400).json({ message: (validationError as Error).message });
        }
        if (resolvedItems.length === 0) {
          return res.status(400).json({ message: "Add at least one item" });
        }
        await prisma.quotationItem.deleteMany({ where: { quotationId: existing.id } });
        data.items = { create: resolvedItems };
      }

      await prisma.quotation.update({ where: { id: existing.id }, data });
      const quotation = await prisma.quotation.findUnique({ where: { id: existing.id }, include: DETAIL_INCLUDE });
      return res.status(200).json({ message: "Quotation updated", quotation });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /quotations/:id */
  static deleteQuotation = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const existing = await QuotationController.loadOwnedQuotation(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Quotation not found" });
      await prisma.quotation.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Quotation deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /quotations/:id/pdf — renders the PDF live on every request, never cached. */
  static downloadPdf = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
      const quotation = await prisma.quotation.findFirst({
        where: { id: parseInt(id as string) },
        include: { items: true, organization: true },
      });
      if (!quotation || quotation.organizationId !== req.organization!.id) {
        return res.status(404).json({ message: "Quotation not found" });
      }

      const organization = quotation.organization;
      const loadOrgImage = async (key: string | null | undefined) => {
        if (!key) return null;
        try {
          return await downloadFileFromStorageCached(key);
        } catch (error) {
          console.error(`Failed to load organization letterhead image "${key}":`, error);
          return null;
        }
      };
      const [signatureImage, stampImage, logoImage] = await Promise.all([
        loadOrgImage(organization?.signatureImagePath),
        loadOrgImage(organization?.stampImagePath),
        loadOrgImage(organization?.logoImagePath),
      ]);

      const doc = buildQuotationPdf({
        quotationNumber: quotation.quotationNumber,
        quotationDate: quotation.quotationDate,
        title: quotation.title,
        currency: quotation.currency,
        taxPercent: quotation.taxPercent,
        organizationName: organization?.name ?? null,
        organizationAddress: organization?.address ?? null,
        organizationContact: organization?.contact ?? null,
        organizationEmail: organization?.email ?? null,
        fromPan: quotation.fromPan,
        regNo: quotation.regNo,
        logoImage,
        customerName: quotation.customerName,
        customerAddress: quotation.customerAddress,
        customerContact: quotation.customerContact,
        customerEmail: quotation.customerEmail,
        customerPan: quotation.customerPan,
        priceBasis: quotation.priceBasis,
        deliveryPeriod: quotation.deliveryPeriod,
        deliveryAddress: quotation.deliveryAddress,
        paymentTerms: quotation.paymentTerms,
        validityPeriod: quotation.validityPeriod,
        signatoryName: quotation.signatoryName,
        signatoryDesignation: quotation.signatoryDesignation,
        signatureImage,
        stampImage,
        items: quotation.items,
      });

      const downloadName = (quotation.quotationNumber || `QT-${quotation.id}`).replace(/\//g, "-");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadName}.pdf"`);
      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
