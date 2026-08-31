import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { roleHasPermission } from "../utils/permissionService";
import { computeCostSheet } from "../utils/costSheet";
import { AddManualRecordPaymentDto, SaveFinanceManualRecordDto, EditCostBreakdownRowDto } from "../dto/purchaseOrderPayment.dto";

/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic (same convention as costSheet.ts). */
const num = (value: { toNumber(): number } | number | string | null | undefined): number => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
};

/** Same admin/super_admin/finance gate frontend routing already applies to the whole
 * Procurement group (see RequireProcurementAccess in App.tsx) — deliberately stricter than the
 * open-to-any-org-member read endpoints elsewhere in procurement, since this surfaces payment
 * amounts. */
const canViewFinance = (role: string) =>
  role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN || role === UserRole.FINANCE;

/** Same edit gate as PurchaseOrderController's payment/item methods — finance must be able to
 * log payments and add manual records even though finance doesn't hold "projects.procurement" by default. */
async function canEditFinance(role: string) {
  return (await roleHasPermission(role, "projects.procurement")) || role === UserRole.FINANCE || role === UserRole.SUPER_ADMIN;
}

const PO_FINANCE_INCLUDE = {
  vendor: true,
  items: true,
  payments: { orderBy: { paidDate: "desc" as const } },
  shipment: { include: { insurance: true, customs: true, letterOfCredit: true } },
  proformaInvoices: { include: { items: true }, orderBy: { updatedAt: "desc" as const } },
} as const;

const MANUAL_RECORD_INCLUDE = {
  vendor: true,
  payments: { orderBy: { paidDate: "desc" as const } },
} as const;

type PaymentEntry = { id: number; amount: number; paidDate: Date; reference: string | null; notes: string | null };

/** A Finance ledger row — either derived from a real PurchaseOrder or entered manually. Both
 * sources render in the same table shape; `source`/`poId`/`manualRecordId` tell the frontend
 * which endpoints to call for editing. */
type FinanceLedgerRow = {
  source: "po" | "manual";
  poId: number | null;
  manualRecordId: number | null;
  poNumber: string | null;
  vendor: { id: number; name: string } | null;
  vendorName: string | null;
  itemNames: string[];
  itemValue: number;
  paymentTerms: string | null;
  amountPaid: number;
  paidDate: Date | null;
  outstandingBalance: number;
  payments: PaymentEntry[];
  createdAt: Date;
};

const toPaymentEntries = (payments: { id: number; amount: { toNumber(): number }; paidDate: Date; reference: string | null; notes: string | null }[]): PaymentEntry[] =>
  payments.map((p) => ({ id: p.id, amount: num(p.amount), paidDate: p.paidDate, reference: p.reference, notes: p.notes }));

/** Finance's per-PO row — one entry per real PurchaseOrder. */
async function buildFinanceRow(po: {
  id: number;
  poNumber: string | null;
  paymentTerms: string | null;
  createdAt: Date;
  vendor: { id: number; name: string } | null;
  items: { itemName: string }[];
  payments: { id: number; amount: { toNumber(): number }; paidDate: Date; reference: string | null; notes: string | null }[];
}): Promise<FinanceLedgerRow> {
  const costSheet = await computeCostSheet(po.id);
  const itemValue = costSheet?.grandTotal ?? 0;
  const payments = toPaymentEntries(po.payments);
  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const paidDate = payments.length > 0 ? payments[0]!.paidDate : null; // payments pre-sorted desc by paidDate

  return {
    source: "po",
    poId: po.id,
    manualRecordId: null,
    poNumber: po.poNumber,
    vendor: po.vendor ? { id: po.vendor.id, name: po.vendor.name } : null,
    vendorName: po.vendor?.name ?? null,
    itemNames: po.items.map((i) => i.itemName),
    itemValue,
    paymentTerms: po.paymentTerms,
    amountPaid,
    paidDate,
    outstandingBalance: itemValue - amountPaid,
    payments,
    createdAt: po.createdAt,
  };
}

/** A manually-entered ledger row — same shape as buildFinanceRow, sourced from FinanceManualRecord instead. */
function buildManualFinanceRow(record: {
  id: number;
  vendorName: string;
  itemName: string;
  referenceNumber: string | null;
  itemValue: { toNumber(): number };
  paymentTerms: string | null;
  createdAt: Date;
  vendor: { id: number; name: string } | null;
  payments: { id: number; amount: { toNumber(): number }; paidDate: Date; reference: string | null; notes: string | null }[];
}): FinanceLedgerRow {
  const itemValue = num(record.itemValue);
  const payments = toPaymentEntries(record.payments);
  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const paidDate = payments.length > 0 ? payments[0]!.paidDate : null;

  return {
    source: "manual",
    poId: null,
    manualRecordId: record.id,
    poNumber: record.referenceNumber,
    vendor: record.vendor ? { id: record.vendor.id, name: record.vendor.name } : null,
    vendorName: record.vendor?.name ?? record.vendorName,
    itemNames: [record.itemName],
    itemValue,
    paymentTerms: record.paymentTerms,
    amountPaid,
    paidDate,
    outstandingBalance: itemValue - amountPaid,
    payments,
    createdAt: record.createdAt,
  };
}

type CostBreakdownRow = {
  itemId: number | null;
  itemName: string;
  majorCost: number;
  freight: number;
  lcNumber: string | null;
  lcCharge: number;
  lcCommission: number;
  vat: number;
  refundableMarginPercent: number;
  refundableAmount: number;
  refundedAmount: number;
  toBeRefunded: number;
  remarks: string | null;
};

/** VAT-refund figures shared by both row builders — refundableAmount/toBeRefunded are always
 * computed, never stored (see the schema comment on PurchaseOrderItem.refundableMarginPercent). */
const refundFields = (vat: number, refundableMarginPercent: number, refundedAmount: number) => {
  const refundableAmount = vat * (refundableMarginPercent / 100);
  return {
    refundableMarginPercent,
    refundableAmount,
    refundedAmount,
    toBeRefunded: refundableAmount - refundedAmount,
  };
};

/** Per-item Item Procure/Major Cost/Freight/LC/VAT breakdown for one PO — freight/LC/VAT
 * default to the same proration as getItemCostReport (split per item by its share of the PO's
 * item-value subtotal), unless that item has a manual override saved from the Finance
 * cost-breakdown page (see updatePurchaseOrderItemBreakdownRow), which wins. */
async function buildPoCostBreakdownRows(po: {
  id: number;
  items: {
    id: number;
    itemName: string;
    quantity: number;
    unitPrice: { toNumber(): number } | null;
    remarks: string | null;
    freightOverride: { toNumber(): number } | null;
    lcChargeOverride: { toNumber(): number } | null;
    lcCommissionOverride: { toNumber(): number } | null;
    vatOverride: { toNumber(): number } | null;
    refundableMarginPercent: { toNumber(): number } | null;
    refundedAmount: { toNumber(): number } | null;
  }[];
  shipment: { letterOfCredit: { lcNumber: string | null } | null } | null;
}): Promise<CostBreakdownRow[]> {
  const costSheet = await computeCostSheet(po.id);
  if (!costSheet) return [];

  const itemsSubtotal = po.items.reduce((sum, item) => sum + item.quantity * num(item.unitPrice), 0);
  const lcNumber = po.shipment?.letterOfCredit?.lcNumber ?? null;

  return po.items.map((item) => {
    const majorCost = item.quantity * num(item.unitPrice);
    const share = itemsSubtotal > 0 ? majorCost / itemsSubtotal : 0;
    const vat = item.vatOverride != null ? num(item.vatOverride) : costSheet.customsVat * share;
    return {
      itemId: item.id,
      itemName: item.itemName,
      majorCost,
      freight: item.freightOverride != null ? num(item.freightOverride) : costSheet.freight * share,
      lcNumber,
      lcCharge: item.lcChargeOverride != null ? num(item.lcChargeOverride) : costSheet.lcCharge * share,
      lcCommission: item.lcCommissionOverride != null ? num(item.lcCommissionOverride) : costSheet.lcCommission * share,
      vat,
      ...refundFields(vat, num(item.refundableMarginPercent), num(item.refundedAmount)),
      remarks: item.remarks,
    };
  });
}

/** Same shape, single row — manual records store these fields directly (no shipment/proration
 * behind them like PurchaseOrderItem's overrides above). */
function buildManualCostBreakdownRows(record: {
  itemName: string;
  itemValue: { toNumber(): number };
  freight: { toNumber(): number } | null;
  lcNumber: string | null;
  lcCharge: { toNumber(): number } | null;
  lcCommission: { toNumber(): number } | null;
  vat: { toNumber(): number } | null;
  refundableMarginPercent: { toNumber(): number } | null;
  refundedAmount: { toNumber(): number } | null;
  remarks: string | null;
}): CostBreakdownRow[] {
  const vat = num(record.vat);
  return [
    {
      itemId: null,
      itemName: record.itemName,
      majorCost: num(record.itemValue),
      freight: num(record.freight),
      lcNumber: record.lcNumber,
      lcCharge: num(record.lcCharge),
      lcCommission: num(record.lcCommission),
      vat,
      ...refundFields(vat, num(record.refundableMarginPercent), num(record.refundedAmount)),
      remarks: record.remarks,
    },
  ];
}

async function loadOwnedManualRecord(id: string, organizationId: number) {
  const recordId = parseInt(id);
  if (!Number.isFinite(recordId)) return null;
  return prisma.financeManualRecord.findFirst({
    where: { id: recordId, organizationId },
    include: MANUAL_RECORD_INCLUDE,
  });
}

/** Finance tracking for Purchase Orders — a payment ledger layered on top of the existing
 * procurement pipeline (Purchase Order -> ... -> Cost Sheet). Cost Sheet already computes what
 * a PO *should* cost; PurchaseOrderPayment (new) tracks what's actually been paid against it.
 * FinanceManualRecord covers ledger rows entered by hand, with no PO behind them. */
/** Validates the shared numeric fields of EditCostBreakdownRowDto — returns an error message, or null if valid. */
function validateCostBreakdownRowInput({
  itemName,
  majorCost,
  freight,
  lcCharge,
  lcCommission,
  vat,
  refundableMarginPercent,
  refundedAmount,
}: EditCostBreakdownRowDto): string | null {
  if (typeof itemName !== "string" || !itemName.trim()) return "Item name is required";
  const nonNegativeFields: [string, unknown][] = [
    ["major cost", majorCost],
    ["freight", freight],
    ["LC charge", lcCharge],
    ["LC commission", lcCommission],
    ["VAT", vat],
    ["refunded amount", refundedAmount],
  ];
  for (const [label, value] of nonNegativeFields) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return `A valid ${label} is required`;
  }
  if (typeof refundableMarginPercent !== "number" || !Number.isFinite(refundableMarginPercent) || refundableMarginPercent < 0 || refundableMarginPercent > 100) {
    return "Refundable margin must be a percentage between 0 and 100";
  }
  return null;
}

export class FinanceController {
  /** GET /workspace/finance/purchase-orders — the main Finance page's ledger table: one row per
   * PO plus one row per manually-entered record, newest first. */
  static getFinanceOverview = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    try {
      const isPlainAdmin = req.user!.role === UserRole.ADMIN;
      const [purchaseOrders, manualRecords] = await Promise.all([
        prisma.purchaseOrder.findMany({
          where: {
            organizationId: req.organization!.id,
            // Mirrors getOrganizationPurchaseOrders: a plain admin only sees POs they created.
            ...(isPlainAdmin ? { createdById: req.user!.id } : {}),
          },
          include: PO_FINANCE_INCLUDE,
          orderBy: { createdAt: "desc" },
        }),
        prisma.financeManualRecord.findMany({
          where: {
            organizationId: req.organization!.id,
            ...(isPlainAdmin ? { createdById: req.user!.id } : {}),
          },
          include: MANUAL_RECORD_INCLUDE,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const rows = (
        await Promise.all([
          ...purchaseOrders.map((po) => buildFinanceRow(po)),
          ...manualRecords.map((r) => buildManualFinanceRow(r)),
        ])
      ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return res.status(200).json({ rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /workspace/finance/vendors/:vendorId — one vendor's POs and manual records plus aggregated totals. */
  static getVendorFinanceSummary = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    const { vendorId } = req.params;
    try {
      const vendor = await prisma.vendor.findFirst({
        where: { id: parseInt(vendorId as string), organizationId: req.organization!.id },
      });
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });

      const isPlainAdmin = req.user!.role === UserRole.ADMIN;
      const [purchaseOrders, manualRecords] = await Promise.all([
        prisma.purchaseOrder.findMany({
          where: {
            organizationId: req.organization!.id,
            vendorId: vendor.id,
            ...(isPlainAdmin ? { createdById: req.user!.id } : {}),
          },
          include: PO_FINANCE_INCLUDE,
          orderBy: { createdAt: "desc" },
        }),
        prisma.financeManualRecord.findMany({
          where: {
            organizationId: req.organization!.id,
            vendorId: vendor.id,
            ...(isPlainAdmin ? { createdById: req.user!.id } : {}),
          },
          include: MANUAL_RECORD_INCLUDE,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const rows = (
        await Promise.all([
          ...purchaseOrders.map((po) => buildFinanceRow(po)),
          ...manualRecords.map((r) => buildManualFinanceRow(r)),
        ])
      ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const totals = rows.reduce(
        (acc, r) => ({
          totalProcurement: acc.totalProcurement + r.itemValue,
          totalAmountPaid: acc.totalAmountPaid + r.amountPaid,
          totalOutstandingBalance: acc.totalOutstandingBalance + r.outstandingBalance,
        }),
        { totalProcurement: 0, totalAmountPaid: 0, totalOutstandingBalance: 0 },
      );

      return res.status(200).json({ vendor: { id: vendor.id, name: vendor.name }, totals, rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /workspace/finance/items — org-wide item cost report, flattening every PO's items with
   * their prorated share of that PO's freight/LC/VAT (allocated by each item's share of the
   * PO's item-value subtotal — the same style of allocation computeCostSheet already uses for
   * landedCostPerUnit, just by value instead of quantity). Manual records have no shipment/LC
   * data behind them, so they're excluded from this report. */
  static getItemCostReport = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    try {
      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
          organizationId: req.organization!.id,
          ...(req.user!.role === UserRole.ADMIN ? { createdById: req.user!.id } : {}),
        },
        include: {
          items: true,
          shipment: { include: { insurance: true, customs: true, letterOfCredit: true } },
          proformaInvoices: { include: { items: true }, orderBy: { updatedAt: "desc" as const } },
        },
        orderBy: { createdAt: "desc" },
      });

      const rows: {
        poId: number;
        poNumber: string | null;
        itemName: string;
        majorCost: number;
        freight: number;
        lcNumber: string | null;
        lcCharge: number;
        lcCommission: number;
        vat: number;
      }[] = [];

      for (const po of purchaseOrders) {
        const costSheet = await computeCostSheet(po.id);
        if (!costSheet) continue;

        const itemsSubtotal = po.items.reduce((sum, item) => sum + item.quantity * num(item.unitPrice), 0);
        const lcNumber = po.shipment?.letterOfCredit?.lcNumber ?? null;

        for (const item of po.items) {
          const majorCost = item.quantity * num(item.unitPrice);
          const share = itemsSubtotal > 0 ? majorCost / itemsSubtotal : 0;

          rows.push({
            poId: po.id,
            poNumber: po.poNumber,
            itemName: item.itemName,
            majorCost,
            freight: costSheet.freight * share,
            lcNumber,
            lcCharge: costSheet.lcCharge * share,
            lcCommission: costSheet.lcCommission * share,
            vat: costSheet.customsVat * share,
          });
        }
      }

      return res.status(200).json({ rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /workspace/finance/purchase-orders/:id/cost-breakdown — the per-item breakdown page
   * reached by clicking a "po"-source row on the Finance page: Item Procure/Major Cost/
   * Freight/LC Number/LC Charge/LC Commission/VAT/Remarks, one row per PO line item. */
  static getPurchaseOrderCostBreakdown = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    try {
      const po = await prisma.purchaseOrder.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: req.organization!.id,
          ...(req.user!.role === UserRole.ADMIN ? { createdById: req.user!.id } : {}),
        },
        include: {
          vendor: true,
          items: true,
          shipment: { include: { insurance: true, customs: true, letterOfCredit: true } },
        },
      });
      if (!po) return res.status(404).json({ message: "Purchase order not found" });

      const rows = await buildPoCostBreakdownRows(po);
      return res.status(200).json({
        source: "po" as const,
        poId: po.id,
        poNumber: po.poNumber,
        vendorName: po.vendor?.name ?? null,
        rows,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /workspace/finance/manual-records/:id/cost-breakdown — same shape for a "manual"-source row. */
  static getManualRecordCostBreakdown = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    try {
      const record = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!record) return res.status(404).json({ message: "Record not found" });

      return res.status(200).json({
        source: "manual" as const,
        manualRecordId: record.id,
        poNumber: record.referenceNumber,
        vendorName: record.vendor?.name ?? record.vendorName,
        rows: buildManualCostBreakdownRows(record),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /workspace/finance/purchase-orders/:poId/items/:itemId — full row edit from the Finance
   * cost-breakdown page. Item name/major cost write straight through to the real
   * PurchaseOrderItem (so they also show up on the PO's own Overview tab); freight/LC
   * charge/LC commission/VAT are saved as this item's override of the normally-computed
   * proration (see buildPoCostBreakdownRows); LC number writes through to the PO's shared
   * Shipment.LetterOfCredit row (one identifier per PO, not per item). */
  static updatePurchaseOrderItemBreakdownRow = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { poId, itemId } = req.params;
    const dto: EditCostBreakdownRowDto = req.body;
    const validationError = validateCostBreakdownRowInput(dto);
    if (validationError) return res.status(400).json({ message: validationError });

    try {
      const po = await prisma.purchaseOrder.findFirst({
        where: {
          id: parseInt(poId as string),
          organizationId: req.organization!.id,
          ...(req.user!.role === UserRole.ADMIN ? { createdById: req.user!.id } : {}),
        },
        include: { shipment: true },
      });
      if (!po) return res.status(404).json({ message: "Purchase order not found" });

      const item = await prisma.purchaseOrderItem.findFirst({
        where: { id: parseInt(itemId as string), purchaseOrderId: po.id },
      });
      if (!item) return res.status(404).json({ message: "Item not found" });

      const trimmedLcNumber = dto.lcNumber?.trim() || null;
      if (trimmedLcNumber && !po.shipment) {
        return res.status(400).json({ message: "Add a shipment to this PO (Shipment tab) before setting an LC number" });
      }

      const quantity = item.quantity || 1;
      await prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: {
          itemName: dto.itemName.trim(),
          unitPrice: dto.majorCost / quantity,
          freightOverride: dto.freight,
          lcChargeOverride: dto.lcCharge,
          lcCommissionOverride: dto.lcCommission,
          vatOverride: dto.vat,
          refundableMarginPercent: dto.refundableMarginPercent,
          refundedAmount: dto.refundedAmount,
          remarks: dto.remarks?.trim() || null,
        },
      });

      if (po.shipment) {
        await prisma.letterOfCredit.upsert({
          where: { shipmentId: po.shipment.id },
          update: { lcNumber: trimmedLcNumber },
          create: { shipmentId: po.shipment.id, lcNumber: trimmedLcNumber },
        });
      }

      return res.status(200).json({ message: "Row updated" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /workspace/finance/manual-records/:id/breakdown — full row edit for a manual record's
   * single line on the Finance cost-breakdown page (distinct from PUT .../manual-records/:id,
   * which is the vendor/terms edit form on the main Finance page). */
  static updateManualRecordBreakdownRow = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    const dto: EditCostBreakdownRowDto = req.body;
    const validationError = validateCostBreakdownRowInput(dto);
    if (validationError) return res.status(400).json({ message: validationError });

    try {
      const existing = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      await prisma.financeManualRecord.update({
        where: { id: existing.id },
        data: {
          itemName: dto.itemName.trim(),
          itemValue: dto.majorCost,
          freight: dto.freight,
          lcNumber: dto.lcNumber?.trim() || null,
          lcCharge: dto.lcCharge,
          lcCommission: dto.lcCommission,
          vat: dto.vat,
          refundableMarginPercent: dto.refundableMarginPercent,
          refundedAmount: dto.refundedAmount,
          remarks: dto.remarks?.trim() || null,
        },
      });

      return res.status(200).json({ message: "Row updated" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/finance/manual-records — adds a freeform Finance ledger row not tied to
   * any real PurchaseOrder (e.g. tracking a payment/balance before a PO exists for it). */
  static createManualRecord = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { vendorName, itemName, referenceNumber, itemValue, paymentTerms, vendorId }: SaveFinanceManualRecordDto = req.body;

    if (!vendorName?.trim()) return res.status(400).json({ message: "Vendor name is required" });
    if (!itemName?.trim()) return res.status(400).json({ message: "Item name is required" });
    if (typeof itemValue !== "number" || !Number.isFinite(itemValue) || itemValue < 0) {
      return res.status(400).json({ message: "A valid item value is required" });
    }

    try {
      let linkedVendorId: number | null = null;
      if (vendorId != null) {
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: req.organization!.id } });
        if (!vendor) return res.status(404).json({ message: "Vendor not found" });
        linkedVendorId = vendor.id;
      }

      const record = await prisma.financeManualRecord.create({
        data: {
          vendorName: vendorName.trim(),
          itemName: itemName.trim(),
          referenceNumber: referenceNumber?.trim() || null,
          itemValue,
          paymentTerms: paymentTerms?.trim() || null,
          vendorId: linkedVendorId,
          organizationId: req.organization!.id,
          createdById: req.user!.id,
        },
        include: MANUAL_RECORD_INCLUDE,
      });

      return res.status(201).json({ message: "Record added", row: buildManualFinanceRow(record) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /workspace/finance/manual-records/:id — edits a manually-entered ledger row. */
  static updateManualRecord = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    const { vendorName, itemName, referenceNumber, itemValue, paymentTerms, vendorId }: SaveFinanceManualRecordDto = req.body;

    if (!vendorName?.trim()) return res.status(400).json({ message: "Vendor name is required" });
    if (!itemName?.trim()) return res.status(400).json({ message: "Item name is required" });
    if (typeof itemValue !== "number" || !Number.isFinite(itemValue) || itemValue < 0) {
      return res.status(400).json({ message: "A valid item value is required" });
    }

    try {
      const existing = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      let linkedVendorId: number | null = null;
      if (vendorId != null) {
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: req.organization!.id } });
        if (!vendor) return res.status(404).json({ message: "Vendor not found" });
        linkedVendorId = vendor.id;
      }

      const record = await prisma.financeManualRecord.update({
        where: { id: existing.id },
        data: {
          vendorName: vendorName.trim(),
          itemName: itemName.trim(),
          referenceNumber: referenceNumber?.trim() || null,
          itemValue,
          paymentTerms: paymentTerms?.trim() || null,
          vendorId: linkedVendorId,
        },
        include: MANUAL_RECORD_INCLUDE,
      });

      return res.status(200).json({ message: "Record updated", row: buildManualFinanceRow(record) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /workspace/finance/manual-records/:id — removes a manually-entered ledger row (and its payment history). */
  static deleteManualRecord = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    try {
      const existing = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      await prisma.financeManualRecord.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Record deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/finance/manual-records/:id/payments — logs one installment against a manual record. */
  static addManualRecordPayment = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    const { amount, paidDate, reference, notes }: AddManualRecordPaymentDto = req.body;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "A valid amount is required" });
    }
    const parsedDate = paidDate ? new Date(paidDate) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "A valid paid date is required" });
    }

    try {
      const existing = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      await prisma.purchaseOrderPayment.create({
        data: {
          manualRecordId: existing.id,
          amount,
          paidDate: parsedDate,
          reference: reference?.trim() || null,
          notes: notes?.trim() || null,
          createdById: req.user!.id,
        },
      });

      const record = await prisma.financeManualRecord.findUnique({ where: { id: existing.id }, include: MANUAL_RECORD_INCLUDE });
      return res.status(201).json({ message: "Payment logged", row: buildManualFinanceRow(record!) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /workspace/finance/manual-records/:id/payments/:paymentId — removes one logged payment. */
  static deleteManualRecordPayment = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { id, paymentId } = req.params;
    try {
      const existing = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      const payment = await prisma.purchaseOrderPayment.findFirst({
        where: { id: parseInt(paymentId as string), manualRecordId: existing.id },
      });
      if (!payment) return res.status(404).json({ message: "Payment not found" });

      await prisma.purchaseOrderPayment.delete({ where: { id: payment.id } });

      const record = await prisma.financeManualRecord.findUnique({ where: { id: existing.id }, include: MANUAL_RECORD_INCLUDE });
      return res.status(200).json({ message: "Payment deleted", row: buildManualFinanceRow(record!) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
