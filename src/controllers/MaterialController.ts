import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { SaveMaterialDto, AddMaterialTransactionDto } from "../dto/material.dto";
import { coerceRowValues } from "../dto/customTableCells.dto";

const VENDOR_SELECT = { select: { id: true, name: true } } as const;

const shapeVendor = (vendor: { id: number; name: string } | null) => (vendor ? { id: vendor.id, name: vendor.name } : null);

const shapeTransaction = (t: {
  id: number;
  type: string;
  quantity: number;
  date: Date;
  vendor: { id: number; name: string } | null;
  unitPrice: number | null;
  workArea: string | null;
  issuedTo: string | null;
  reference: string | null;
  remarks: string | null;
  createdAt: Date;
}) => ({
  id: t.id,
  type: t.type,
  quantity: t.quantity,
  date: t.date.toISOString().slice(0, 10),
  vendor: shapeVendor(t.vendor),
  unitPrice: t.unitPrice,
  workArea: t.workArea,
  issuedTo: t.issuedTo,
  reference: t.reference,
  remarks: t.remarks,
  createdAt: t.createdAt.toISOString(),
});

const shapeMaterial = (m: {
  id: number;
  name: string;
  code: string | null;
  category: string | null;
  unit: string;
  minStock: number;
  vendor: { id: number; name: string } | null;
  customFields: unknown;
  transactions: Parameters<typeof shapeTransaction>[0][];
}) => ({
  id: m.id,
  name: m.name,
  code: m.code,
  category: m.category,
  unit: m.unit,
  minStock: m.minStock,
  vendor: shapeVendor(m.vendor),
  customFields: (m.customFields as Record<string, unknown> | null) ?? {},
  transactions: m.transactions.map(shapeTransaction),
});

/** Current on-hand quantity — always computed from transactions, never
 * stored (see Material's doc comment in schema.prisma). */
function currentStockOf(transactions: { type: string; quantity: number }[]): number {
  return transactions.reduce((sum, t) => sum + (t.type === "received" ? t.quantity : -t.quantity), 0);
}

/** Materials page (per-project stock/receipt ledger) — replaces the earlier
 * custom-tabs-of-spreadsheets version of this page entirely. */
export class MaterialController {
  /** GET /materials?projectId — every material for this project, with its
   * full transaction history embedded (newest first). One payload; the
   * frontend computes received/used/current stock/status/value/stats/
   * recent-activity/vendor-spend from it, same as this page's own design
   * mockup does client-side. */
  static list = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt(req.query.projectId as string, 10);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const materials = await prisma.material.findMany({
        where: { organizationId, projectId },
        include: {
          vendor: VENDOR_SELECT,
          transactions: { orderBy: { date: "desc" }, include: { vendor: VENDOR_SELECT } },
        },
        orderBy: { name: "asc" },
      });

      return res.status(200).json({ materials: materials.map(shapeMaterial) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /materials?projectId — creates a material master row (admin-only). */
  static create = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt((req.query.projectId as string) ?? (req.body.projectId as string), 10);
    const body: SaveMaterialDto = req.body;
    const name = (body.name || "").trim();
    const unit = (body.unit || "").trim();
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    if (!name) return res.status(400).json({ message: "Material name is required" });
    if (!unit) return res.status(400).json({ message: "Unit is required" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const fields = await prisma.materialField.findMany({ where: { organizationId, projectId } });

      const material = await prisma.material.create({
        data: {
          organizationId,
          projectId,
          name,
          unit,
          code: body.code?.trim() || null,
          category: body.category?.trim() || null,
          minStock: body.minStock != null && Number.isFinite(Number(body.minStock)) ? Number(body.minStock) : 0,
          vendorId: body.vendorId ?? null,
          customFields: coerceRowValues(fields, body.customFields),
        },
        include: { vendor: VENDOR_SELECT },
      });
      return res.status(201).json({ material: shapeMaterial({ ...material, transactions: [] }) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /materials/:id — edits a material master row (admin-only). */
  static update = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const materialId = parseInt(id as string, 10);
    if (!Number.isInteger(materialId)) return res.status(400).json({ message: "Invalid material id" });

    const body: SaveMaterialDto = req.body;
    const name = (body.name || "").trim();
    const unit = (body.unit || "").trim();
    if (!name) return res.status(400).json({ message: "Material name is required" });
    if (!unit) return res.status(400).json({ message: "Unit is required" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.material.findFirst({ where: { id: materialId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Material not found" });

      const fields = await prisma.materialField.findMany({ where: { organizationId, projectId: existing.projectId } });

      const updated = await prisma.material.update({
        where: { id: materialId },
        data: {
          name,
          unit,
          code: body.code?.trim() || null,
          category: body.category?.trim() || null,
          minStock: body.minStock != null && Number.isFinite(Number(body.minStock)) ? Number(body.minStock) : 0,
          vendorId: body.vendorId ?? null,
          customFields: coerceRowValues(fields, body.customFields),
        },
        include: { vendor: VENDOR_SELECT, transactions: { orderBy: { date: "desc" }, include: { vendor: VENDOR_SELECT } } },
      });
      return res.status(200).json({ material: shapeMaterial(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /materials/:id (admin-only) — cascades its transactions. */
  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const materialId = parseInt(id as string, 10);
    if (!Number.isInteger(materialId)) return res.status(400).json({ message: "Invalid material id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.material.findFirst({ where: { id: materialId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Material not found" });

      await prisma.material.delete({ where: { id: materialId } });
      return res.status(200).json({ message: "Material deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /materials/:id/transactions — records a receive-or-use event (any
   * org member — data entry, same permission level as Plant Report's row
   * CRUD). For "used", the current stock is recomputed authoritatively from
   * existing transactions server-side and the request rejected if it would
   * go negative, rather than trusting whatever stock figure the client last
   * rendered. */
  static addTransaction = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const materialId = parseInt(id as string, 10);
    if (!Number.isInteger(materialId)) return res.status(400).json({ message: "Invalid material id" });

    const body: AddMaterialTransactionDto = req.body;
    if (body.type !== "received" && body.type !== "used") {
      return res.status(400).json({ message: "type must be 'received' or 'used'" });
    }
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "A valid quantity is required" });
    }
    const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? new Date(body.date) : null;
    if (!date) return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });

    try {
      const organizationId = req.organization!.id;
      const material = await prisma.material.findFirst({
        where: { id: materialId, organizationId },
        include: { transactions: { select: { type: true, quantity: true } } },
      });
      if (!material) return res.status(404).json({ message: "Material not found" });

      if (body.type === "used") {
        const currentStock = currentStockOf(material.transactions);
        if (quantity > currentStock) {
          return res.status(400).json({ message: `Only ${currentStock} ${material.unit} is currently available.` });
        }
      }

      const created = await prisma.materialTransaction.create({
        data: {
          materialId,
          type: body.type,
          quantity,
          date,
          vendorId: body.type === "received" ? (body.vendorId ?? null) : null,
          unitPrice: body.type === "received" && body.unitPrice != null && Number.isFinite(Number(body.unitPrice)) ? Number(body.unitPrice) : null,
          workArea: body.type === "used" ? body.workArea?.trim() || null : null,
          issuedTo: body.type === "used" ? body.issuedTo?.trim() || null : null,
          reference: body.reference?.trim() || null,
          remarks: body.remarks?.trim() || null,
          createdById: req.user!.id,
        },
        include: { vendor: VENDOR_SELECT },
      });

      // A "received" transaction's vendor becomes the material's new default, so the
      // next "Receive Material" entry for it pre-fills with whoever it was last bought from.
      if (body.type === "received" && body.vendorId) {
        await prisma.material.update({ where: { id: materialId }, data: { vendorId: body.vendorId } });
      }

      return res.status(201).json({ transaction: shapeTransaction(created) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /materials/transactions/:id (admin-only) — a minimal correction
   * path for a bad entry; not part of the page's day-to-day flow. */
  static deleteTransaction = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const transactionId = parseInt(id as string, 10);
    if (!Number.isInteger(transactionId)) return res.status(400).json({ message: "Invalid transaction id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialTransaction.findFirst({
        where: { id: transactionId, material: { organizationId } },
      });
      if (!existing) return res.status(404).json({ message: "Transaction not found" });

      await prisma.materialTransaction.delete({ where: { id: transactionId } });
      return res.status(200).json({ message: "Transaction deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
