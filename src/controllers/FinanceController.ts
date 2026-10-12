import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { roleHasPermission } from "../utils/permissionService";
import { computeCostSheetFromData, PurchaseOrderForCostSheet } from "../utils/costSheet";
import { getTodayExchangeRates } from "../utils/exchangeRates";
import { AddManualRecordPaymentDto, SaveFinanceManualRecordDto, EditCostBreakdownRowDto } from "../dto/purchaseOrderPayment.dto";
import { buildCostBreakdownStatementPdf, StatementRowCell } from "../utils/costBreakdownStatementPdf";
import { downloadFileFromStorageCached } from "../config/supabaseStorage";

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
  project: { select: { id: true, name: true } },
  payments: { orderBy: { paidDate: "desc" as const } },
  lines: { orderBy: { id: "asc" as const } },
} as const;

/** Currency options offered on the Finance page's Add/Edit Record form. */
const MANUAL_RECORD_CURRENCIES = new Set(["NPR", "INR", "USD", "RMB"]);

type PaymentEntry = {
  id: number;
  amount: number;
  paidDate: Date;
  /** NPR per 1 unit of the row's currency at the time this installment was paid — null for NPR
   * rows or payments logged before this field existed. */
  exchangeRate: number | null;
  reference: string | null;
  notes: string | null;
};

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
  project: { id: number; name: string } | null;
  lcNumber: string | null;
  itemNames: string[];
  itemValue: number;
  paymentTerms: string | null;
  amountPaid: number;
  paidDate: Date | null;
  outstandingBalance: number;
  payments: PaymentEntry[];
  createdAt: Date;
  currency: string;
};

const toPaymentEntries = (
  payments: {
    id: number;
    amount: { toNumber(): number };
    paidDate: Date;
    exchangeRate: { toNumber(): number } | null;
    reference: string | null;
    notes: string | null;
  }[],
): PaymentEntry[] =>
  payments.map((p) => ({
    id: p.id,
    amount: num(p.amount),
    paidDate: p.paidDate,
    exchangeRate: p.exchangeRate != null ? num(p.exchangeRate) : null,
    reference: p.reference,
    notes: p.notes,
  }));

/** Finance's per-PO row — one entry per real PurchaseOrder. `po` must already carry everything
 * computeCostSheetFromData needs (PO_FINANCE_INCLUDE provides it) — avoids a second per-row
 * fetch that used to re-load the same PO once for every row on this page. */
async function buildFinanceRow(
  po: {
    id: number;
    poNumber: string | null;
    paymentTerms: string | null;
    createdAt: Date;
    currency: string | null;
    vendor: { id: number; name: string } | null;
    items: { itemName: string }[];
    payments: { id: number; amount: { toNumber(): number }; paidDate: Date; exchangeRate: { toNumber(): number } | null; reference: string | null; notes: string | null }[];
  } & PurchaseOrderForCostSheet,
): Promise<FinanceLedgerRow> {
  const costSheet = computeCostSheetFromData(po);
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
    project: null,
    lcNumber: po.shipment?.letterOfCredit?.lcNumber ?? null,
    itemNames: po.items.map((i) => i.itemName),
    itemValue,
    paymentTerms: po.paymentTerms,
    amountPaid,
    paidDate,
    outstandingBalance: itemValue - amountPaid,
    payments,
    createdAt: po.createdAt,
    currency: po.currency || "NPR",
  };
}

/** A manually-entered ledger row — same shape as buildFinanceRow, sourced from FinanceManualRecord instead. */
function buildManualFinanceRow(record: {
  id: number;
  vendorName: string;
  itemName: string;
  referenceNumber: string | null;
  lcNumber: string | null;
  itemValue: { toNumber(): number };
  paymentTerms: string | null;
  createdAt: Date;
  currency: string;
  vendor: { id: number; name: string } | null;
  project: { id: number; name: string } | null;
  payments: { id: number; amount: { toNumber(): number }; paidDate: Date; exchangeRate: { toNumber(): number } | null; reference: string | null; notes: string | null }[];
  lines: { itemName: string; majorCost: { toNumber(): number } }[];
}): FinanceLedgerRow {
  // The record's own value is the first line; "Add Line" extras add to it.
  const itemValue = num(record.itemValue) + record.lines.reduce((sum, l) => sum + num(l.majorCost), 0);
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
    project: record.project ? { id: record.project.id, name: record.project.name } : null,
    lcNumber: record.lcNumber,
    itemNames: [record.itemName, ...record.lines.map((l) => l.itemName)].filter((n, i, all) => n.trim() !== "" && all.indexOf(n) === i),
    itemValue,
    paymentTerms: record.paymentTerms,
    amountPaid,
    paidDate,
    outstandingBalance: itemValue - amountPaid,
    payments,
    createdAt: record.createdAt,
    currency: record.currency || "NPR",
  };
}

type CostBreakdownRow = {
  itemId: number | null;
  date: Date | null;
  itemName: string;
  majorCost: number;
  freight: number;
  lcNumber: string | null;
  lcAmount: number;
  lcCharge: number;
  lcCommission: number;
  vat: number;
  importDuties: number;
  insurance: number;
  bibini: number;
  otherMargin: number;
  refundableAmount: number;
  refundedAmount: number;
  toBeRefunded: number;
  remarks: string | null;
};

/** VAT-refund figures shared by both row builders — both refundableAmount and refundedAmount are
 * manually entered per row; toBeRefunded is just the difference. */
const refundFields = (refundableAmount: number, refundedAmount: number) => ({
  refundableAmount,
  refundedAmount,
  toBeRefunded: refundableAmount - refundedAmount,
});

const fmtAmount = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Column defs for the cost-breakdown PDF statement - same columns/order as the Finance
 * cost-breakdown page's table (see FinanceCostBreakdown.tsx). */
const costBreakdownPdfColumns = [
  { header: "Date", width: 1.2 },
  { header: "Item Procure", width: 1.6 },
  { header: "Major Cost", align: "right" as const, width: 1.25 },
  { header: "Freight", align: "right" as const },
  { header: "LC Amount", align: "right" as const },
  { header: "LC Charge", align: "right" as const },
  { header: "LC Comm.", align: "right" as const },
  { header: "VAT", align: "right" as const },
  { header: "Import Duties", align: "right" as const },
  { header: "Insurance", align: "right" as const },
  { header: "Bibini", align: "right" as const },
  { header: "Other Margin", align: "right" as const },
  { header: "Refundable (NPR)", align: "right" as const },
  { header: "Refunded (NPR)", align: "right" as const },
  { header: "To Be Refunded (NPR)", align: "right" as const },
  { header: "Remarks", width: 1.3 },
];

const fmtPdfDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "--";

const costBreakdownRowToCells = (r: CostBreakdownRow): StatementRowCell[] => [
  { text: fmtPdfDate(r.date) },
  { text: r.itemName },
  { text: fmtAmount(r.majorCost) },
  { text: fmtAmount(r.freight) },
  { text: fmtAmount(r.lcAmount) },
  { text: fmtAmount(r.lcCharge) },
  { text: fmtAmount(r.lcCommission) },
  { text: fmtAmount(r.vat) },
  { text: fmtAmount(r.importDuties) },
  { text: fmtAmount(r.insurance) },
  { text: fmtAmount(r.bibini) },
  { text: fmtAmount(r.otherMargin) },
  { text: fmtAmount(r.refundableAmount) },
  { text: fmtAmount(r.refundedAmount) },
  { text: fmtAmount(r.toBeRefunded), color: r.toBeRefunded > 0 ? "#9A5B05" : "#1F7A45" },
  { text: r.remarks || "--" },
];

/** Streams the branded cost-breakdown statement PDF (see utils/costBreakdownStatementPdf.ts) for
 * either a PO or a manual record - `ledger` supplies the money summary (total / paid / outstanding). */
async function sendCostBreakdownStatement(
  req: AuthRequest,
  res: Response,
  opts: {
    rows: CostBreakdownRow[];
    ledger: FinanceLedgerRow;
    referenceNumber: string | null;
    vendorName: string | null;
    fileBase: string;
  },
) {
  const { rows, ledger } = opts;
  const org = req.organization!;
  const currency = ledger.currency || "NPR";
  const money = (n: number) => `${currency} ${fmtAmount(n)}`;

  const loadImage = async (key: string | null | undefined) => {
    if (!key) return null;
    try {
      return await downloadFileFromStorageCached(key);
    } catch (error) {
      console.error(`Failed to load organization image "${key}":`, error);
      return null;
    }
  };
  const [logoImage, signatureImage] = await Promise.all([loadImage(org.logoImagePath), loadImage(org.signatureImagePath)]);

  const sum = (pick: (r: CostBreakdownRow) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const lcNumbers = [...new Set(rows.map((r) => r.lcNumber).filter(Boolean))] as string[];
  const settled = ledger.outstandingBalance <= 0;
  const progress = ledger.itemValue > 0 ? Math.min(100, (ledger.amountPaid / ledger.itemValue) * 100) : 0;

  const doc = buildCostBreakdownStatementPdf({
    organizationName: org.name,
    organizationTagline: org.description,
    organizationAddress: org.address,
    organizationContact: org.contact,
    organizationEmail: org.email,
    logoImage,
    signatureImage,
    title: "Cost Breakdown Statement",
    subtitle: `Detailed view of the cost breakdown${opts.referenceNumber ? ` for ${opts.referenceNumber}` : ""}`,
    details: [
      { label: "Reference No.", value: opts.referenceNumber || "--" },
      { label: "Vendor", value: opts.vendorName || "--" },
      ...(ledger.project ? [{ label: "Project", value: ledger.project.name }] : []),
      { label: "LC Number", value: lcNumbers.join(", ") || "--" },
      { label: "Currency", value: currency },
      { label: "Terms of Payment", value: ledger.paymentTerms || "--" },
      { label: "Lines", value: String(rows.length) },
    ],
    statusLabel: settled ? "Settled" : "Outstanding",
    statusTone: settled ? "good" : "warn",
    statusRows: [
      { label: "Total Value", value: money(ledger.itemValue) },
      { label: "Amount Paid", value: money(ledger.amountPaid) },
      { label: "Outstanding Balance", value: money(ledger.outstandingBalance) },
    ],
    columns: costBreakdownPdfColumns,
    rows: rows.map(costBreakdownRowToCells),
    totalsRow: [
      "Total",
      "",
      fmtAmount(sum((r) => r.majorCost)),
      fmtAmount(sum((r) => r.freight)),
      fmtAmount(sum((r) => r.lcAmount)),
      fmtAmount(sum((r) => r.lcCharge)),
      fmtAmount(sum((r) => r.lcCommission)),
      fmtAmount(sum((r) => r.vat)),
      fmtAmount(sum((r) => r.importDuties)),
      fmtAmount(sum((r) => r.insurance)),
      fmtAmount(sum((r) => r.bibini)),
      fmtAmount(sum((r) => r.otherMargin)),
      fmtAmount(sum((r) => r.refundableAmount)),
      fmtAmount(sum((r) => r.refundedAmount)),
      fmtAmount(sum((r) => r.toBeRefunded)),
      "",
    ],
    summary: [
      { label: "Total Value", value: money(ledger.itemValue), caption: "(Cost sheet)" },
      { label: "Total Paid", value: money(ledger.amountPaid), caption: "(Debit)" },
      { label: "Outstanding Balance", value: money(ledger.outstandingBalance), caption: "(Payable)" },
      { label: "Payment Progress", value: `${progress.toFixed(2)}%`, progress },
    ],
    notes: [
      "This statement includes all cost-breakdown lines recorded against the above reference.",
      `Amounts are in ${currency}; the refund columns are in NPR (Nepalese Rupee).`,
      "For any discrepancies, please contact our finance department.",
    ],
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${opts.fileBase}.pdf"`);
  doc.pipe(res);
  doc.end();
}

/** Per-item Item Procure/Major Cost/Freight/LC/VAT breakdown for one PO — freight/LC/VAT
 * default to the same proration as getItemCostReport (split per item by its share of the PO's
 * item-value subtotal), unless that item has a manual override saved from the Finance
 * cost-breakdown page (see updatePurchaseOrderItemBreakdownRow), which wins. */
async function buildPoCostBreakdownRows(
  po: {
    id: number;
    items: {
      id: number;
      itemName: string;
      quantity: number;
      unitPrice: { toNumber(): number } | null;
      remarks: string | null;
      lineDate: Date | null;
      freightOverride: { toNumber(): number } | null;
      lcChargeOverride: { toNumber(): number } | null;
      lcCommissionOverride: { toNumber(): number } | null;
      vatOverride: { toNumber(): number } | null;
      importDutiesOverride: { toNumber(): number } | null;
      insuranceOverride: { toNumber(): number } | null;
      refundableAmount: { toNumber(): number } | null;
      refundedAmount: { toNumber(): number } | null;
      lcAmount: { toNumber(): number } | null;
      bibini: { toNumber(): number } | null;
      otherMargin: { toNumber(): number } | null;
    }[];
  } & PurchaseOrderForCostSheet,
): Promise<CostBreakdownRow[]> {
  const costSheet = computeCostSheetFromData(po);

  const itemsSubtotal = po.items.reduce((sum, item) => sum + item.quantity * num(item.unitPrice), 0);
  const lcNumber = po.shipment?.letterOfCredit?.lcNumber ?? null;

  return po.items.map((item) => {
    const majorCost = item.quantity * num(item.unitPrice);
    const share = itemsSubtotal > 0 ? majorCost / itemsSubtotal : 0;
    const vat = item.vatOverride != null ? num(item.vatOverride) : costSheet.customsVat * share;
    return {
      itemId: item.id,
      date: item.lineDate,
      itemName: item.itemName,
      majorCost,
      freight: item.freightOverride != null ? num(item.freightOverride) : costSheet.freight * share,
      lcNumber,
      lcAmount: num(item.lcAmount),
      lcCharge: item.lcChargeOverride != null ? num(item.lcChargeOverride) : costSheet.lcCharge * share,
      lcCommission: item.lcCommissionOverride != null ? num(item.lcCommissionOverride) : costSheet.lcCommission * share,
      vat,
      importDuties: item.importDutiesOverride != null ? num(item.importDutiesOverride) : costSheet.customsDuty * share,
      insurance: item.insuranceOverride != null ? num(item.insuranceOverride) : costSheet.insurancePremium * share,
      bibini: num(item.bibini),
      otherMargin: num(item.otherMargin),
      ...refundFields(num(item.refundableAmount), num(item.refundedAmount)),
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
  lcAmount: { toNumber(): number } | null;
  lcCharge: { toNumber(): number } | null;
  lcCommission: { toNumber(): number } | null;
  vat: { toNumber(): number } | null;
  importDuties: { toNumber(): number } | null;
  insurance: { toNumber(): number } | null;
  bibini: { toNumber(): number } | null;
  otherMargin: { toNumber(): number } | null;
  refundableAmount: { toNumber(): number } | null;
  refundedAmount: { toNumber(): number } | null;
  remarks: string | null;
  lineDate: Date | null;
  lines: {
    id: number;
    lineDate: Date | null;
    itemName: string;
    majorCost: { toNumber(): number };
    freight: { toNumber(): number };
    lcNumber: string | null;
    lcAmount: { toNumber(): number };
    lcCharge: { toNumber(): number };
    lcCommission: { toNumber(): number };
    vat: { toNumber(): number };
    importDuties: { toNumber(): number };
    insurance: { toNumber(): number };
    bibini: { toNumber(): number };
    otherMargin: { toNumber(): number };
    refundableAmount: { toNumber(): number };
    refundedAmount: { toNumber(): number };
    remarks: string | null;
  }[];
}): CostBreakdownRow[] {
  const vat = num(record.vat);
  const extraLines: CostBreakdownRow[] = record.lines.map((l) => ({
    itemId: l.id,
    date: l.lineDate,
    itemName: l.itemName,
    majorCost: num(l.majorCost),
    freight: num(l.freight),
    lcNumber: l.lcNumber,
    lcAmount: num(l.lcAmount),
    lcCharge: num(l.lcCharge),
    lcCommission: num(l.lcCommission),
    vat: num(l.vat),
    importDuties: num(l.importDuties),
    insurance: num(l.insurance),
    bibini: num(l.bibini),
    otherMargin: num(l.otherMargin),
    ...refundFields(num(l.refundableAmount), num(l.refundedAmount)),
    remarks: l.remarks,
  }));
  return [
    {
      itemId: null,
      date: record.lineDate,
      itemName: record.itemName,
      majorCost: num(record.itemValue),
      freight: num(record.freight),
      lcNumber: record.lcNumber,
      lcAmount: num(record.lcAmount),
      lcCharge: num(record.lcCharge),
      lcCommission: num(record.lcCommission),
      vat,
      importDuties: num(record.importDuties),
      insurance: num(record.insurance),
      bibini: num(record.bibini),
      otherMargin: num(record.otherMargin),
      ...refundFields(num(record.refundableAmount), num(record.refundedAmount)),
      remarks: record.remarks,
    },
    ...extraLines,
  ];
}

/** Trims, drops blanks and de-duplicates (case-insensitively) a list of item names from the form. */
const cleanItemNames = (names: unknown): string[] => {
  if (!Array.isArray(names)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const name = typeof n === "string" ? n.trim() : "";
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
};

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
  lcAmount,
  lcCharge,
  lcCommission,
  vat,
  importDuties,
  insurance,
  bibini,
  otherMargin,
  refundableAmount,
  refundedAmount,
}: EditCostBreakdownRowDto, allowBlankName = false): string | null {
  if (typeof itemName !== "string" || (!allowBlankName && !itemName.trim())) return "Item name is required";
  const nonNegativeFields: [string, unknown][] = [
    ["major cost", majorCost],
    ["freight", freight],
    ["LC amount", lcAmount],
    ["LC charge", lcCharge],
    ["LC commission", lcCommission],
    ["VAT", vat],
    ["import duties", importDuties],
    ["insurance", insurance],
    ["Bibini", bibini],
    ["other margin", otherMargin],
    ["refundable amount", refundableAmount],
    ["refunded amount", refundedAmount],
  ];
  for (const [label, value] of nonNegativeFields) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return `A valid ${label} is required`;
  }
  return null;
}

export class FinanceController {
  /** GET /workspace/finance/exchange-rates — today's USD/INR/RMB -> NPR selling rates (NRB),
   * used on the cost-breakdown page to show a non-NPR manual record's Refunded amount in NPR. */
  static getExchangeRates = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    try {
      const rates = await getTodayExchangeRates();
      return res.status(200).json({ date: new Date().toISOString().slice(0, 10), rates });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

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
        const costSheet = computeCostSheetFromData(po);

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
          // Needed by computeCostSheetFromData (via buildPoCostBreakdownRows) — included here
          // so that computation doesn't have to re-fetch this same PO a second time.
          proformaInvoices: { include: { items: true }, orderBy: { updatedAt: "desc" as const } },
        },
      });
      if (!po) return res.status(404).json({ message: "Purchase order not found" });

      const rows = await buildPoCostBreakdownRows(po);
      return res.status(200).json({
        source: "po" as const,
        poId: po.id,
        poNumber: po.poNumber,
        vendorName: po.vendor?.name ?? null,
        // PurchaseOrder.currency is a free-text PDF label ("US Dollar"), not a code — no
        // standardized currency to convert from here, unlike manual records below.
        currency: null,
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
        currency: record.currency,
        rows: buildManualCostBreakdownRows(record),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /workspace/finance/purchase-orders/:id/cost-breakdown/pdf — the Export button's PDF
   * option, same rows as getPurchaseOrderCostBreakdown rendered as a report instead of JSON. */
  static exportPurchaseOrderCostBreakdownPdf = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    try {
      const po = await prisma.purchaseOrder.findFirst({
        where: {
          id: parseInt(id as string),
          organizationId: req.organization!.id,
          ...(req.user!.role === UserRole.ADMIN ? { createdById: req.user!.id } : {}),
        },
        include: PO_FINANCE_INCLUDE,
      });
      if (!po) return res.status(404).json({ message: "Purchase order not found" });

      const rows = await buildPoCostBreakdownRows(po);
      const ledger = await buildFinanceRow(po);
      await sendCostBreakdownStatement(req, res, {
        rows,
        ledger,
        referenceNumber: po.poNumber,
        vendorName: po.vendor?.name ?? null,
        fileBase: `cost-breakdown-${(po.poNumber || `PO-${po.id}`).replace(/\//g, "-")}`,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /workspace/finance/manual-records/:id/cost-breakdown/pdf — same for a "manual"-source row. */
  static exportManualRecordCostBreakdownPdf = async (req: AuthRequest, res: Response) => {
    if (!canViewFinance(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    try {
      const record = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!record) return res.status(404).json({ message: "Record not found" });

      const rows = buildManualCostBreakdownRows(record);
      await sendCostBreakdownStatement(req, res, {
        rows,
        ledger: buildManualFinanceRow(record),
        referenceNumber: record.referenceNumber,
        vendorName: record.vendor?.name ?? record.vendorName,
        fileBase: `cost-breakdown-${(record.referenceNumber || `record-${record.id}`).replace(/\//g, "-")}`,
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
          lcAmount: dto.lcAmount,
          lcChargeOverride: dto.lcCharge,
          lcCommissionOverride: dto.lcCommission,
          vatOverride: dto.vat,
          importDutiesOverride: dto.importDuties,
          insuranceOverride: dto.insurance,
          bibini: dto.bibini,
          otherMargin: dto.otherMargin,
          refundableAmount: dto.refundableAmount,
          refundedAmount: dto.refundedAmount,
          remarks: dto.remarks?.trim() || null,
          lineDate: dto.date ? new Date(dto.date) : null,
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
    const validationError = validateCostBreakdownRowInput(dto, true);
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
          lcAmount: dto.lcAmount,
          lcCharge: dto.lcCharge,
          lcCommission: dto.lcCommission,
          vat: dto.vat,
          importDuties: dto.importDuties,
          insurance: dto.insurance,
          bibini: dto.bibini,
          otherMargin: dto.otherMargin,
          refundableAmount: dto.refundableAmount,
          refundedAmount: dto.refundedAmount,
          remarks: dto.remarks?.trim() || null,
          lineDate: dto.date ? new Date(dto.date) : null,
        },
      });

      return res.status(200).json({ message: "Row updated" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/finance/manual-records/:id/lines - "Add Line": an extra cost-breakdown line
   * on a manual record. Created with just a name; the rest is filled in via the inline editor. */
  static addManualRecordLine = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { itemName }: { itemName?: string } = req.body;

    try {
      const existing = await loadOwnedManualRecord(req.params.id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      // Every line of a record is the same item, so a new line inherits the record's item name unless one is given.
      const line = await prisma.financeManualLine.create({
        data: { manualRecordId: existing.id, itemName: itemName?.trim() || existing.itemName, lineDate: new Date() },
      });
      return res.status(201).json({ message: "Line added", lineId: line.id });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /workspace/finance/manual-records/:id/lines/:lineId - full edit of an added line. */
  static updateManualRecordLine = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const dto: EditCostBreakdownRowDto = req.body;
    const validationError = validateCostBreakdownRowInput(dto, true);
    if (validationError) return res.status(400).json({ message: validationError });

    try {
      const existing = await loadOwnedManualRecord(req.params.id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });
      const line = existing.lines.find((l) => l.id === parseInt(req.params.lineId as string));
      if (!line) return res.status(404).json({ message: "Line not found" });

      await prisma.financeManualLine.update({
        where: { id: line.id },
        data: {
          itemName: dto.itemName.trim(),
          majorCost: dto.majorCost,
          freight: dto.freight,
          lcNumber: dto.lcNumber?.trim() || null,
          lcAmount: dto.lcAmount,
          lcCharge: dto.lcCharge,
          lcCommission: dto.lcCommission,
          vat: dto.vat,
          importDuties: dto.importDuties,
          insurance: dto.insurance,
          bibini: dto.bibini,
          otherMargin: dto.otherMargin,
          refundableAmount: dto.refundableAmount,
          refundedAmount: dto.refundedAmount,
          remarks: dto.remarks?.trim() || null,
          lineDate: dto.date ? new Date(dto.date) : null,
        },
      });
      return res.status(200).json({ message: "Line updated" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /workspace/finance/manual-records/:id/lines/:lineId */
  static deleteManualRecordLine = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    try {
      const existing = await loadOwnedManualRecord(req.params.id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });
      const line = existing.lines.find((l) => l.id === parseInt(req.params.lineId as string));
      if (!line) return res.status(404).json({ message: "Line not found" });

      await prisma.financeManualLine.delete({ where: { id: line.id } });
      return res.status(200).json({ message: "Line deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /workspace/finance/manual-records - adds a freeform Finance ledger row not tied to
   * any real PurchaseOrder (e.g. tracking a payment/balance before a PO exists for it). */
  static createManualRecord = async (req: AuthRequest, res: Response) => {
    if (!(await canEditFinance(req.user!.role))) return res.status(403).json({ message: "Forbidden" });

    const { vendorName, itemName, itemNames, referenceNumber, itemValue, paymentTerms, vendorId, projectId, lcNumber, currency }: SaveFinanceManualRecordDto = req.body;
    const items = cleanItemNames(itemNames ?? (itemName ? [itemName] : []));

    if (!lcNumber?.trim()) return res.status(400).json({ message: "LC number is required" });
    if (typeof itemValue !== "number" || !Number.isFinite(itemValue) || itemValue < 0) {
      return res.status(400).json({ message: "A valid item value is required" });
    }
    if (currency !== undefined && !MANUAL_RECORD_CURRENCIES.has(currency)) {
      return res.status(400).json({ message: "Invalid currency" });
    }

    try {
      let linkedVendorId: number | null = null;
      let resolvedVendorName = vendorName?.trim() || "";
      if (vendorId != null) {
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: req.organization!.id } });
        if (!vendor) return res.status(404).json({ message: "Vendor not found" });
        linkedVendorId = vendor.id;
        resolvedVendorName = vendor.name;
      }
      if (!resolvedVendorName) return res.status(400).json({ message: "Select a vendor" });

      let linkedProjectId: number | null = null;
      if (projectId != null) {
        const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: req.organization!.id } });
        if (!project) return res.status(404).json({ message: "Project not found" });
        linkedProjectId = project.id;
      }

      const record = await prisma.financeManualRecord.create({
        data: {
          vendorName: resolvedVendorName,
          itemName: items[0] ?? "",
          ...(items.length > 1 ? { lines: { create: items.slice(1).map((name) => ({ itemName: name, lineDate: new Date() })) } } : {}),
          referenceNumber: referenceNumber?.trim() || null,
          itemValue,
          paymentTerms: paymentTerms?.trim() || null,
          vendorId: linkedVendorId,
          projectId: linkedProjectId,
          lcNumber: lcNumber?.trim() || null,
          currency: currency || "NPR",
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
    const { vendorName, itemName, newItemNames, referenceNumber, itemValue, paymentTerms, vendorId, projectId, lcNumber, currency }: SaveFinanceManualRecordDto = req.body;
    const addedItems = cleanItemNames(newItemNames);

    if (!lcNumber?.trim()) return res.status(400).json({ message: "LC number is required" });

    if (typeof itemValue !== "number" || !Number.isFinite(itemValue) || itemValue < 0) {
      return res.status(400).json({ message: "A valid item value is required" });
    }
    if (currency !== undefined && !MANUAL_RECORD_CURRENCIES.has(currency)) {
      return res.status(400).json({ message: "Invalid currency" });
    }

    try {
      const existing = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      let linkedVendorId: number | null = null;
      let resolvedVendorName = vendorName?.trim() || "";
      if (vendorId != null) {
        const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId: req.organization!.id } });
        if (!vendor) return res.status(404).json({ message: "Vendor not found" });
        linkedVendorId = vendor.id;
        resolvedVendorName = vendor.name;
      }
      if (!resolvedVendorName) return res.status(400).json({ message: "Select a vendor" });

      let linkedProjectId: number | null = null;
      if (projectId != null) {
        const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: req.organization!.id } });
        if (!project) return res.status(404).json({ message: "Project not found" });
        linkedProjectId = project.id;
      }

      const record = await prisma.financeManualRecord.update({
        where: { id: existing.id },
        data: {
          vendorName: resolvedVendorName,
          itemName: itemName?.trim() ?? existing.itemName,
          ...(addedItems.length > 0 ? { lines: { create: addedItems.map((name) => ({ itemName: name, lineDate: new Date() })) } } : {}),
          referenceNumber: referenceNumber?.trim() || null,
          itemValue,
          paymentTerms: paymentTerms?.trim() || null,
          vendorId: linkedVendorId,
          projectId: linkedProjectId,
          lcNumber: lcNumber?.trim() || null,
          ...(currency ? { currency } : {}),
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
    const { amount, paidDate, exchangeRate, reference, notes }: AddManualRecordPaymentDto = req.body;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "A valid amount is required" });
    }
    const parsedDate = paidDate ? new Date(paidDate) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "A valid paid date is required" });
    }
    if (exchangeRate != null && (typeof exchangeRate !== "number" || !Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
      return res.status(400).json({ message: "A valid exchange rate is required" });
    }

    try {
      const existing = await loadOwnedManualRecord(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Record not found" });

      await prisma.purchaseOrderPayment.create({
        data: {
          manualRecordId: existing.id,
          amount,
          paidDate: parsedDate,
          exchangeRate: exchangeRate ?? null,
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
