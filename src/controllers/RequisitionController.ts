import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";

/** Same admin/super_admin/finance gate as the rest of the Procurement group. */
const canAccessRequisitions = (role: string) =>
  role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN || role === UserRole.FINANCE;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Pulls the columns the History list shows out of the submitted form (`data` itself is stored untouched). */
function summarize(data: Record<string, unknown>) {
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const date = typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(data.date) ? new Date(data.date) : null;
  return {
    requisitionNo: str(data.requisitionNo),
    requisitionDate: date && !Number.isNaN(date.getTime()) ? date : null,
    requestedBy: str(data.requestedBy),
    priority: str(data.priority),
    itemCount: items.filter((i) => ["description", "unit", "qty", "comment"].some((k) => str(i?.[k]) !== null)).length,
  };
}

const isFormData = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const toRow = (r: {
  id: number;
  requisitionNo: string | null;
  requisitionDate: Date | null;
  requestedBy: string | null;
  priority: string | null;
  itemCount: number;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { fullName: string } | null;
}) => ({
  id: r.id,
  requisitionNo: r.requisitionNo,
  requisitionDate: r.requisitionDate,
  requestedBy: r.requestedBy,
  priority: r.priority,
  itemCount: r.itemCount,
  createdByName: r.createdBy?.fullName ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  data: r.data,
});

const INCLUDE = { createdBy: { select: { fullName: true } } } as const;

export class RequisitionController {
  /** GET /workspace/requisitions - every saved requisition for the organization, newest first (the History list). */
  static list = async (req: AuthRequest, res: Response) => {
    if (!canAccessRequisitions(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    try {
      const rows = await prisma.requisition.findMany({
        where: { organizationId: req.organization!.id },
        include: INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ rows: rows.map(toRow) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/requisitions - first save of a new requisition. Body: { data: <the form> }. */
  static create = async (req: AuthRequest, res: Response) => {
    if (!canAccessRequisitions(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const { data } = req.body as { data?: unknown };
    if (!isFormData(data)) return res.status(400).json({ message: "Requisition data is required" });
    try {
      const row = await prisma.requisition.create({
        data: { ...summarize(data), data: data as object, organizationId: req.organization!.id, createdById: req.user!.id },
        include: INCLUDE,
      });
      return res.status(201).json({ message: "Requisition saved", row: toRow(row) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /workspace/requisitions/:id - saving changes to an existing requisition. */
  static update = async (req: AuthRequest, res: Response) => {
    if (!canAccessRequisitions(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const { data } = req.body as { data?: unknown };
    if (!isFormData(data)) return res.status(400).json({ message: "Requisition data is required" });
    try {
      const existing = await prisma.requisition.findFirst({ where: { id: parseInt(req.params.id as string), organizationId: req.organization!.id } });
      if (!existing) return res.status(404).json({ message: "Requisition not found" });
      const row = await prisma.requisition.update({
        where: { id: existing.id },
        data: { ...summarize(data), data: data as object },
        include: INCLUDE,
      });
      return res.status(200).json({ message: "Requisition updated", row: toRow(row) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /workspace/requisitions/:id */
  static remove = async (req: AuthRequest, res: Response) => {
    if (!canAccessRequisitions(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    try {
      const existing = await prisma.requisition.findFirst({ where: { id: parseInt(req.params.id as string), organizationId: req.organization!.id } });
      if (!existing) return res.status(404).json({ message: "Requisition not found" });
      await prisma.requisition.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Requisition deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
