import { prisma } from "../config/prisma";

/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic. */
const num = (value: { toNumber(): number } | number | string | null | undefined): number => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
};

export interface CostSheetBreakdown {
  piValue: number;
  piSource: "proforma_invoice" | "purchase_order_items";
  freight: number;
  loading: number;
  unloading: number;
  fuel: number;
  shipmentMiscellaneous: number;
  localTax: number;
  insurancePremium: number;
  customsDuty: number;
  customsVat: number;
  customsExcise: number;
  customsServiceCharge: number;
  customsDocumentation: number;
  customsInspection: number;
  customsWarehouse: number;
  customsMiscellaneous: number;
  lcCharge: number;
  lcCommission: number;
  grandTotal: number;
  totalQuantity: number;
  landedCostPerUnit: number;
}

/** The exact fields computeCostSheetFromData reads off a PurchaseOrder — narrow on purpose so
 * any caller that already has a PO loaded (with this shape, however it got it) can compute the
 * cost sheet without a second DB round-trip. Matches the include computeCostSheet itself uses
 * below, and PO_FINANCE_INCLUDE / getItemCostReport's / getPurchaseOrderCostBreakdown's own
 * queries in FinanceController.ts. */
export interface PurchaseOrderForCostSheet {
  items: { quantity: number; unitPrice: { toNumber(): number } | number | string | null }[];
  shipment: {
    freightCost: { toNumber(): number } | number | string | null;
    loadingCost: { toNumber(): number } | number | string | null;
    unloadingCost: { toNumber(): number } | number | string | null;
    fuelCost: { toNumber(): number } | number | string | null;
    miscellaneousCost: { toNumber(): number } | number | string | null;
    localTaxCost: { toNumber(): number } | number | string | null;
    insurance: { premium: { toNumber(): number } | number | string | null } | null;
    customs: {
      importDuty: { toNumber(): number } | number | string | null;
      vat: { toNumber(): number } | number | string | null;
      excise: { toNumber(): number } | number | string | null;
      serviceCharge: { toNumber(): number } | number | string | null;
      documentationCost: { toNumber(): number } | number | string | null;
      inspectionCost: { toNumber(): number } | number | string | null;
      warehouseCost: { toNumber(): number } | number | string | null;
      miscellaneousCost: { toNumber(): number } | number | string | null;
    } | null;
    letterOfCredit: {
      lcCharge: { toNumber(): number } | number | string | null;
      lcCommission: { toNumber(): number } | number | string | null;
      /** Not read by the cost-sheet computation itself — included here only so callers that
       * also need it (buildPoCostBreakdownRows) can use this one shared shipment type instead
       * of declaring their own overlapping narrower one. */
      lcNumber: string | null;
    } | null;
  } | null;
  proformaInvoices: {
    status: string;
    exchangeRate: { toNumber(): number } | number | string | null;
    items: { quantity: number; unitPrice: { toNumber(): number } | number | string | null }[];
  }[];
}

/**
 * Computes the "Cost Sheet" (spec section 9) for a purchase order — always
 * derived on the fly from PI/Shipment/Insurance/Customs, never stored.
 *
 * PI Value: sum(item.quantity * item.unitPrice) of the PO's most recent
 * "approved" ProformaInvoice, times its exchangeRate. Falls back to the PO's
 * own item subtotal when no approved PI exists yet — needed both for POs
 * still early in the pipeline and for historical POs created by the
 * ProcurementItem migration script, which never got a PI.
 *
 * Grand Total = PI Value + Shipment costs (freight/loading/unloading/fuel/
 * misc/localTax) + Insurance premium + Letter of Credit charge/commission +
 * Customs cost fields (duty/vat/excise/serviceCharge/documentation/
 * inspection/warehouse/misc).
 * Landed Cost Per Unit = Grand Total / total PO item quantity — this is the
 * figure GoodsReceiptController writes onto InventoryItem.averageCost when a
 * GRN is accepted.
 *
 * Pure/synchronous — no DB access. Callers that only have a purchaseOrderId
 * should use computeCostSheet below instead; callers that already have a
 * matching PO loaded (e.g. FinanceController's list endpoints, which would
 * otherwise re-fetch the same PO once per row) call this directly.
 */
export function computeCostSheetFromData(purchaseOrder: PurchaseOrderForCostSheet): CostSheetBreakdown {
  const approvedPi = purchaseOrder.proformaInvoices.find((pi) => pi.status === "approved");
  let piValue: number;
  let piSource: CostSheetBreakdown["piSource"];
  if (approvedPi) {
    const itemsTotal = approvedPi.items.reduce((sum, item) => sum + item.quantity * num(item.unitPrice), 0);
    piValue = itemsTotal * num(approvedPi.exchangeRate || 1);
    piSource = "proforma_invoice";
  } else {
    piValue = purchaseOrder.items.reduce((sum, item) => sum + item.quantity * num(item.unitPrice), 0);
    piSource = "purchase_order_items";
  }

  const shipment = purchaseOrder.shipment;
  const freight = num(shipment?.freightCost);
  const loading = num(shipment?.loadingCost);
  const unloading = num(shipment?.unloadingCost);
  const fuel = num(shipment?.fuelCost);
  const shipmentMiscellaneous = num(shipment?.miscellaneousCost);
  const localTax = num(shipment?.localTaxCost);
  const insurancePremium = num(shipment?.insurance?.premium);
  const lcCharge = num(shipment?.letterOfCredit?.lcCharge);
  const lcCommission = num(shipment?.letterOfCredit?.lcCommission);

  const customs = shipment?.customs;
  const customsDuty = num(customs?.importDuty);
  const customsVat = num(customs?.vat);
  const customsExcise = num(customs?.excise);
  const customsServiceCharge = num(customs?.serviceCharge);
  const customsDocumentation = num(customs?.documentationCost);
  const customsInspection = num(customs?.inspectionCost);
  const customsWarehouse = num(customs?.warehouseCost);
  const customsMiscellaneous = num(customs?.miscellaneousCost);

  const grandTotal =
    piValue +
    freight +
    loading +
    unloading +
    fuel +
    shipmentMiscellaneous +
    localTax +
    insurancePremium +
    lcCharge +
    lcCommission +
    customsDuty +
    customsVat +
    customsExcise +
    customsServiceCharge +
    customsDocumentation +
    customsInspection +
    customsWarehouse +
    customsMiscellaneous;

  const totalQuantity = purchaseOrder.items.reduce((sum, item) => sum + item.quantity, 0) || 1;

  return {
    piValue,
    piSource,
    freight,
    loading,
    unloading,
    fuel,
    shipmentMiscellaneous,
    localTax,
    insurancePremium,
    customsDuty,
    customsVat,
    customsExcise,
    customsServiceCharge,
    customsDocumentation,
    customsInspection,
    customsWarehouse,
    customsMiscellaneous,
    lcCharge,
    lcCommission,
    grandTotal,
    totalQuantity,
    landedCostPerUnit: grandTotal / totalQuantity,
  };
}

/** By-id convenience wrapper around computeCostSheetFromData, for callers that don't already
 * have a matching PO loaded. */
export async function computeCostSheet(purchaseOrderId: number): Promise<CostSheetBreakdown | null> {
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      items: true,
      shipment: { include: { insurance: true, customs: true, letterOfCredit: true } },
      proformaInvoices: { include: { items: true }, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!purchaseOrder) return null;
  return computeCostSheetFromData(purchaseOrder);
}
