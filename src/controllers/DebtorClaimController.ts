import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { SaveDebtorClaimDto } from "../dto/debtor.dto";

const num = (value: { toNumber(): number } | null | undefined): number => {
  if (value == null) return 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
};

/** Same gate as DebtorController. */
const canAccessDebtors = (role: string) =>
  role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN || role === UserRole.FINANCE;

type ClaimRecord = {
  id: number;
  paymentDate: Date | null;
  purpose: string | null;
  commercialInvoiceNo: string | null;
  claimReceived: { toNumber(): number };
  reimbursementPurpose: string | null;
  reimbursementAmount: { toNumber(): number };
  reimbursementReceived: { toNumber(): number };
};

function buildClaimRow(c: ClaimRecord) {
  const claimReceived = num(c.claimReceived);
  const reimbursementAmount = num(c.reimbursementAmount);
  const reimbursementReceived = num(c.reimbursementReceived);
  return {
    id: c.id,
    paymentDate: c.paymentDate,
    purpose: c.purpose,
    commercialInvoiceNo: c.commercialInvoiceNo,
    claimReceived,
    reimbursementPurpose: c.reimbursementPurpose,
    reimbursementAmount,
    reimbursementReceived,
    reimbursementBalance: reimbursementAmount - reimbursementReceived,
  };
}

const AMOUNT_FIELDS: (keyof SaveDebtorClaimDto)[] = ["claimReceived", "reimbursementAmount", "reimbursementReceived"];

function validateClaim(body: SaveDebtorClaimDto): string | null {
  if (body.paymentDate && Number.isNaN(new Date(body.paymentDate).getTime())) return "A valid date is required";
  for (const f of AMOUNT_FIELDS) {
    const v = body[f];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return "Amounts must be valid non-negative numbers";
  }
  return null;
}

const clean = (v: string | null | undefined) => v?.trim() || null;

function loadOwnedDebtor(id: string, organizationId: number) {
  const debtorId = parseInt(id);
  if (!Number.isFinite(debtorId)) return null;
  return prisma.debtorRecord.findFirst({
    where: { id: debtorId, organizationId },
    include: { claims: { orderBy: { id: "asc" } } },
  });
}

export class DebtorClaimController {
  /** GET /workspace/debtors/:id — the debtor header (name, total amount, LC number) plus its claim lines. */
  static getDebtorDetail = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    try {
      const debtor = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!debtor) return res.status(404).json({ message: "Record not found" });
      return res.status(200).json({
        debtor: {
          id: debtor.id,
          debtorName: debtor.debtorName,
          lcNumber: debtor.lcNumber,
          totalAmount: num(debtor.amountDue),
          claimAmount: num(debtor.claimAmount),
          currency: debtor.currency || "NPR",
        },
        claims: debtor.claims.map(buildClaimRow),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/debtors/:id/claims */
  static createClaim = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const body: SaveDebtorClaimDto = req.body;
    const invalid = validateClaim(body);
    if (invalid) return res.status(400).json({ message: invalid });
    try {
      const debtor = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!debtor) return res.status(404).json({ message: "Record not found" });
      const claim = await prisma.debtorClaim.create({
        data: {
          debtorId: debtor.id,
          paymentDate: body.paymentDate ? new Date(body.paymentDate) : null,
          purpose: clean(body.purpose),
          commercialInvoiceNo: clean(body.commercialInvoiceNo),
          claimReceived: body.claimReceived,
          reimbursementPurpose: clean(body.reimbursementPurpose),
          reimbursementAmount: body.reimbursementAmount,
          reimbursementReceived: body.reimbursementReceived,
        },
      });
      return res.status(201).json({ message: "Line added", claim: buildClaimRow(claim) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /workspace/debtors/:id/claims/:claimId */
  static updateClaim = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    const body: SaveDebtorClaimDto = req.body;
    const invalid = validateClaim(body);
    if (invalid) return res.status(400).json({ message: invalid });
    try {
      const debtor = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!debtor) return res.status(404).json({ message: "Record not found" });
      const existing = debtor.claims.find((c) => c.id === parseInt(req.params.claimId as string));
      if (!existing) return res.status(404).json({ message: "Line not found" });
      const claim = await prisma.debtorClaim.update({
        where: { id: existing.id },
        data: {
          paymentDate: body.paymentDate ? new Date(body.paymentDate) : null,
          purpose: clean(body.purpose),
          commercialInvoiceNo: clean(body.commercialInvoiceNo),
          claimReceived: body.claimReceived,
          reimbursementPurpose: clean(body.reimbursementPurpose),
          reimbursementAmount: body.reimbursementAmount,
          reimbursementReceived: body.reimbursementReceived,
        },
      });
      return res.status(200).json({ message: "Line updated", claim: buildClaimRow(claim) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /workspace/debtors/:id/claims/:claimId */
  static deleteClaim = async (req: AuthRequest, res: Response) => {
    if (!canAccessDebtors(req.user!.role)) return res.status(403).json({ message: "Forbidden" });
    try {
      const debtor = await loadOwnedDebtor(req.params.id as string, req.organization!.id);
      if (!debtor) return res.status(404).json({ message: "Record not found" });
      const existing = debtor.claims.find((c) => c.id === parseInt(req.params.claimId as string));
      if (!existing) return res.status(404).json({ message: "Line not found" });
      await prisma.debtorClaim.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Line deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
