import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { SavePurchaseBillDto, ImportPurchaseBillsDto } from "../dto/purchaseBill.dto";

const MAX_LIST = 5000;
const MAX_IMPORT_ROWS = 1000;

const BILL_INCLUDE = {
  project: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true, contactPerson: true, contact: true, address: true } },
  createdBy: { select: { id: true, fullName: true } },
} as const;

type BillWithRelations = NonNullable<Awaited<ReturnType<typeof prisma.purchaseBill.findFirst<{ include: typeof BILL_INCLUDE }>>>>;

const shapeBill = (b: BillWithRelations) => ({
  id: b.id,
  projectId: b.projectId,
  projectName: b.project.name,
  date: b.date.toISOString().slice(0, 10),
  billNo: b.billNo,
  challanNo: b.challanNo,
  vendorId: b.vendorId,
  vendorName: b.vendorName,
  vendor: b.vendor
    ? { id: b.vendor.id, name: b.vendor.name, contactPerson: b.vendor.contactPerson, phone: b.vendor.contact, address: b.vendor.address }
    : null,
  material: b.material,
  unit: b.unit,
  quantity: b.quantity,
  rate: b.rate,
  vatRate: b.vatRate,
  actualAmount: b.actualAmount,
  vehicleNo: b.vehicleNo,
  paymentMode: b.paymentMode,
  paidBy: b.paidBy,
  billStatus: b.billStatus,
  site: b.site,
  remarks: b.remarks,
  createdByName: b.createdBy?.fullName ?? null,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
});

const trimOrNull = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

type CleanBill = {
  date: Date;
  billNo: string | null;
  challanNo: string | null;
  vendorId: number | null;
  vendorName: string;
  material: string;
  unit: string | null;
  quantity: number;
  rate: number;
  vatRate: number;
  actualAmount: number;
  vehicleNo: string | null;
  paymentMode: string;
  paidBy: string | null;
  billStatus: string;
  site: string | null;
  remarks: string | null;
};

/** Validates + normalizes one bill payload, returning an error message or the
 * clean values. Shared by create, update and every imported row. */
function parseBill(body: SavePurchaseBillDto): { error: string } | { value: CleanBill } {
  if (!body || typeof body !== "object") return { error: "Invalid bill" };
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) return { error: "A valid date is required" };
  const date = new Date(`${body.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { error: "A valid date is required" };

  const vendorName = trimOrNull(body.vendorName);
  if (!vendorName) return { error: "Vendor name is required" };
  const material = trimOrNull(body.material);
  if (!material) return { error: "Material / particulars is required" };

  const quantity = Number(body.quantity);
  const rate = Number(body.rate);
  if (!Number.isFinite(quantity) || quantity < 0) return { error: "Quantity must be a number" };
  if (!Number.isFinite(rate) || rate < 0) return { error: "Rate must be a number" };

  const vatRate = body.vatRate == null || (body.vatRate as unknown) === "" ? 13 : Number(body.vatRate);
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) return { error: "VAT % must be between 0 and 100" };

  const actualAmount = body.actualAmount == null || (body.actualAmount as unknown) === "" ? 0 : Number(body.actualAmount);
  if (!Number.isFinite(actualAmount) || actualAmount < 0) return { error: "Actual amount must be a number" };

  const paymentMode = body.paymentMode ?? "credit";
  if (paymentMode !== "cash" && paymentMode !== "credit") return { error: "Cash/Credit must be 'cash' or 'credit'" };

  const total = quantity * rate * (1 + vatRate / 100);
  const billStatus = body.billStatus ?? (actualAmount <= 0 ? "pending" : actualAmount >= total - 0.005 ? "paid" : "partial");
  if (billStatus !== "pending" && billStatus !== "partial" && billStatus !== "paid") {
    return { error: "Bill status must be pending, partial or paid" };
  }

  return {
    value: {
      date,
      billNo: trimOrNull(body.billNo),
      challanNo: trimOrNull(body.challanNo),
      vendorId: body.vendorId ?? null,
      vendorName,
      material,
      unit: trimOrNull(body.unit),
      quantity,
      rate,
      vatRate,
      actualAmount,
      vehicleNo: trimOrNull(body.vehicleNo),
      paymentMode,
      paidBy: trimOrNull(body.paidBy),
      billStatus,
      site: trimOrNull(body.site),
      remarks: trimOrNull(body.remarks),
    },
  };
}

/** Points the bill at one of this organization's vendors: an explicit vendorId
 * must belong to the organization; otherwise the typed name is matched
 * case-insensitively to an existing vendor (and stays a plain name if none). */
function resolveVendor(
  clean: CleanBill,
  vendors: { id: number; name: string }[],
): { vendorId: number | null; vendorName: string } {
  const byId = clean.vendorId != null ? vendors.find((v) => v.id === clean.vendorId) : undefined;
  const match = byId ?? vendors.find((v) => v.name.trim().toLowerCase() === clean.vendorName.toLowerCase());
  return match ? { vendorId: match.id, vendorName: match.name } : { vendorId: null, vendorName: clean.vendorName };
}

/** Purchase page — a per-organization purchase-bill ledger, optionally
 * narrowed to one project. */
export class PurchaseBillController {
  /** GET /purchase-bills?projectId — every bill (newest first, capped), for one
   * project or, without projectId, across the organization. The frontend does
   * the filtering, paging, sorting and stats from this one payload. */
  static list = async (req: AuthRequest, res: Response) => {
    try {
      const organizationId = req.organization!.id;
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : null;
      if (req.query.projectId && !Number.isInteger(projectId)) return res.status(400).json({ message: "Invalid projectId" });

      const bills = await prisma.purchaseBill.findMany({
        where: { organizationId, ...(projectId ? { projectId } : {}) },
        include: BILL_INCLUDE,
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: MAX_LIST,
      });
      return res.status(200).json({ bills: bills.map(shapeBill) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-bills — records one bill (any org member). */
  static create = async (req: AuthRequest, res: Response) => {
    const body: SavePurchaseBillDto = req.body;
    const projectId = Number(body?.projectId);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    const parsed = parseBill(body);
    if ("error" in parsed) return res.status(400).json({ message: parsed.error });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const vendors = await prisma.vendor.findMany({ where: { organizationId }, select: { id: true, name: true } });
      const created = await prisma.purchaseBill.create({
        data: { ...parsed.value, ...resolveVendor(parsed.value, vendors), organizationId, projectId, createdById: req.user!.id },
        include: BILL_INCLUDE,
      });
      return res.status(201).json({ bill: shapeBill(created) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /purchase-bills/:id — edits a bill (any org member). */
  static update = async (req: AuthRequest, res: Response) => {
    const billId = parseInt(req.params.id as string, 10);
    if (!Number.isInteger(billId)) return res.status(400).json({ message: "Invalid bill id" });
    const body: SavePurchaseBillDto = req.body;
    const parsed = parseBill(body);
    if ("error" in parsed) return res.status(400).json({ message: parsed.error });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.purchaseBill.findFirst({ where: { id: billId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Bill not found" });

      let projectId = existing.projectId;
      if (body.projectId != null && Number(body.projectId) !== existing.projectId) {
        const project = await prisma.project.findFirst({ where: { id: Number(body.projectId), organizationId } });
        if (!project) return res.status(404).json({ message: "Project not found in this organization" });
        projectId = project.id;
      }

      const vendors = await prisma.vendor.findMany({ where: { organizationId }, select: { id: true, name: true } });
      const updated = await prisma.purchaseBill.update({
        where: { id: billId },
        data: { ...parsed.value, ...resolveVendor(parsed.value, vendors), projectId },
        include: BILL_INCLUDE,
      });
      return res.status(200).json({ bill: shapeBill(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /purchase-bills/:id (admin-only). */
  static remove = async (req: AuthRequest, res: Response) => {
    const billId = parseInt(req.params.id as string, 10);
    if (!Number.isInteger(billId)) return res.status(400).json({ message: "Invalid bill id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.purchaseBill.findFirst({ where: { id: billId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Bill not found" });

      await prisma.purchaseBill.delete({ where: { id: billId } });
      return res.status(200).json({ message: "Bill deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /purchase-bills/import — bulk-creates bills from a spreadsheet parsed
   * client-side (any org member, same level as recording one bill). Invalid
   * rows are skipped and reported rather than failing the whole file. */
  static importBills = async (req: AuthRequest, res: Response) => {
    const body: ImportPurchaseBillsDto = req.body;
    const projectId = Number(body?.projectId);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    if (!Array.isArray(body.rows)) return res.status(400).json({ message: "rows are required" });
    if (body.rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ message: `Import up to ${MAX_IMPORT_ROWS} rows at a time` });
    }

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const vendors = await prisma.vendor.findMany({ where: { organizationId }, select: { id: true, name: true } });
      const data: (CleanBill & { organizationId: number; projectId: number; createdById: number })[] = [];
      const errors: { row: number; message: string }[] = [];

      body.rows.forEach((raw, index) => {
        const parsed = parseBill(raw);
        if ("error" in parsed) {
          errors.push({ row: index + 1, message: parsed.error });
          return;
        }
        data.push({
          ...parsed.value,
          ...resolveVendor(parsed.value, vendors),
          organizationId,
          projectId,
          createdById: req.user!.id,
        });
      });

      if (data.length > 0) await prisma.purchaseBill.createMany({ data });
      return res.status(200).json({ created: data.length, skipped: errors.length, errors: errors.slice(0, 10) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
