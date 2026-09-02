"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCostSheet = computeCostSheet;
const prisma_1 = require("../config/prisma");
/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic. */
const num = (value) => {
    if (value == null)
        return 0;
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    if (typeof value === "string")
        return Number(value) || 0;
    const n = value.toNumber();
    return Number.isFinite(n) ? n : 0;
};
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
 */
async function computeCostSheet(purchaseOrderId) {
    const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
            items: true,
            shipment: { include: { insurance: true, customs: true, letterOfCredit: true } },
            proformaInvoices: { include: { items: true }, orderBy: { updatedAt: "desc" } },
        },
    });
    if (!purchaseOrder)
        return null;
    const approvedPi = purchaseOrder.proformaInvoices.find((pi) => pi.status === "approved");
    let piValue;
    let piSource;
    if (approvedPi) {
        const itemsTotal = approvedPi.items.reduce((sum, item) => sum + item.quantity * num(item.unitPrice), 0);
        piValue = itemsTotal * num(approvedPi.exchangeRate || 1);
        piSource = "proforma_invoice";
    }
    else {
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
    const grandTotal = piValue +
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
//# sourceMappingURL=costSheet.js.map