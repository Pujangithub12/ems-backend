import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { AddDebtorPaymentDto, SaveDebtorRecordDto } from "../dto/debtor.dto";

const num = (value: { toNumber(): number } | null | undefined): number => {
  if (value == null) return 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
};

/** Same admin/super_admin/finance gate as the Finance page (see FinanceController) — debtor
 * records surface payment amounts, so reads and writes share one role check. */
const canAccessDebtors = (role: string) =>
  role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN || role === UserRole.FINANCE;

const CURRENCIES = new Set(["NPR", "INR", "USD", "RMB"]);

const DEBTOR_INCLUDE = {
  project: { select: { id: true, name: true } },
  payments: { orderBy: { receivedDate: "desc" as const } },
} as const;

type DebtorWithPayments = {
  id: number;
  debtorName: string;
  itemName: string;
  referenceNumber: string | null;
  lcNumber: string | null;
  amountDue: { toNumber(): number };
  claimAmount: { toNumber(): number };
  currency: string;
  paymentTerms: string | null;
  createdAt: Date;
  project: { id: number; name: string } | null;
  payments: { id: number; amount: { toNumber(): number }; receivedDate: Date; reference: string | null; notes: string | null }[];
};

function buildDebtorRow(record: DebtorWithPayments) {
  const amountDue = num(record.amountDue);
  const payments = record.payments.map((p) => ({
    id: p.id,
    amount: num(p.amount),
    receivedDate: p.receivedDate,
    reference: p.reference,
    notes: p.notes,
  }));
  const amountReceived = payments.reduce((sum, p) => sum + p.amount, 0);
  return {
    id: record.id,
    debtorName: record.debtorName,
    itemName: record.itemName,
    referenceNumber: record.referenceNumber,
    lcNumber: record.lcNumber,
    amountDue,
    claimAmount: num(record.claimAmount),
    currency: record.currency || "NPR",
    paymentTerms: record.paymentTerms,
    project: record.project ? { id: record.project.id, name: record.project.name } : null,
    amountReceived,
    receivedDate: payments.length > 0 ? payments[0]!.receivedDate : null, // pre-sorted desc
    outstandingBalance: amountDue - amountReceived,
    payments,
    createdAt: record.createdAt,
  };
}

function loadOwnedDebtor(id: string, organizationId: number) {
  const debtorId = parseInt(id);
  if (!Number.isFinite(debtorId)) return null;
  return prisma.debtorRecord.findFirst({ where: { id: debtorId, organizationId }, include: DEBTOR_INCLUDE });
}

function validateRecord({ debtorName, itemName, amountDue, claimAmount, currency }: SaveDebtorRecordDto): string | null {
  if (!debtorName?.trim()) return "Debtor name is required";
  if (!itemName?.trim()) return "Item name is required";
  if (typeof amountDue !== "number" || !Number.isFinite(amountDue) || amountDue < 0) return "A valid amount due is required";
  if (claimAmount !== undefined && (typeof claimAmount !== "number" || !Number.isFinite(claimAmount) || claimAmount < 0)) return "A valid claim amount is required";
  if (currency !== undefined && !CURRENCIES.has(currency)) return "Invalid currency";
  return null;
}

/** Resolves an optional projectId to one owned by the organization; `error` is set when it doesn't exist. */
async function resolveProjectId(projectId: number | null | undefined, organizationId: number) {
  if (projectId == null) return { id: null as number | null, error: false };
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  return project ? { id: project.id as number | null, error: false } : { id: null as number | null, error: true };
}

export class DebtorController {
  /** GET /workspace/debtors — every debtor record for the current organization. */
  static getDebtors = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    try {
      const records = await prisma.debtorRecord.findMany({
        where: { organizationId: req.organization!.id },
        include: DEBTOR_INCLUDE,
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ rows: records.map(buildDebtorRow) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/debtors */
  static createDebtor = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const body: SaveDebtorRecordDto = req.body;
    const invalid = validateRecord(body);
    if (invalid) return res.status(400).json({ message: invalid });

    try {
      const project = await resolveProjectId(body.projectId, req.organization!.id);
      if (project.error) return res.status(404).json({ message: "Project not found" });
      const record = await prisma.debtorRecord.create({
        data: {
          debtorName: body.debtorName.trim(),
          itemName: body.itemName.trim(),
          referenceNumber: body.referenceNumber?.trim() || null,
          lcNumber: body.lcNumber?.trim() || null,
          amountDue: body.amountDue,
          claimAmount: body.claimAmount ?? 0,
          paymentTerms: body.paymentTerms?.trim() || null,
          currency: body.currency || "NPR",
          projectId: project.id,
          organizationId: req.organization!.id,
          createdById: req.user!.id,
        },
        include: DEBTOR_INCLUDE,
      });
      return res.status(201).json({ message: "Record added", row: buildDebtorRow(record) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /workspace/debtors/:id */
  static updateDebtor = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const body: SaveDebtorRecordDto = req.body;
    const invalid = validateRecord(body);
    if (invalid) return res.status(400).json({ message: invalid });

    try {
      const existing = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      const project = await resolveProjectId(body.projectId, req.organization!.id);
      if (project.error) return res.status(404).json({ message: "Project not found" });
      const record = await prisma.debtorRecord.update({
        where: { id: existing.id },
        data: {
          debtorName: body.debtorName.trim(),
          itemName: body.itemName.trim(),
          referenceNumber: body.referenceNumber?.trim() || null,
          lcNumber: body.lcNumber?.trim() || null,
          amountDue: body.amountDue,
          claimAmount: body.claimAmount ?? 0,
          paymentTerms: body.paymentTerms?.trim() || null,
          projectId: project.id,
          ...(body.currency ? { currency: body.currency } : {}),
        },
        include: DEBTOR_INCLUDE,
      });
      return res.status(200).json({ message: "Record updated", row: buildDebtorRow(record) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /workspace/debtors/:id — also removes its payment history (cascade). */
  static deleteDebtor = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    try {
      const existing = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });
      await prisma.debtorRecord.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Record deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/debtors/:id/payments — logs one installment received. */
  static addPayment = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const { amount, receivedDate, reference, notes }: AddDebtorPaymentDto = req.body;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "A valid amount is required" });
    }
    const parsedDate = receivedDate ? new Date(receivedDate) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "A valid received date is required" });
    }

    try {
      const existing = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      await prisma.debtorPayment.create({
        data: {
          debtorId: existing.id,
          amount,
          receivedDate: parsedDate,
          reference: reference?.trim() || null,
          notes: notes?.trim() || null,
          createdById: req.user!.id,
        },
      });
      const record = await prisma.debtorRecord.findUnique({ where: { id: existing.id }, include: DEBTOR_INCLUDE });
      return res.status(201).json({ message: "Payment logged", row: buildDebtorRow(record!) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /workspace/debtors/:id/payments/:paymentId */
  static deletePayment = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    try {
      const existing = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      const payment = await prisma.debtorPayment.findFirst({
        where: { id: parseInt(req.params.paymentId as string), debtorId: existing.id },
      });
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      await prisma.debtorPayment.delete({ where: { id: payment.id } });

      const record = await prisma.debtorRecord.findUnique({ where: { id: existing.id }, include: DEBTOR_INCLUDE });
      return res.status(200).json({ message: "Payment deleted", row: buildDebtorRow(record!) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
