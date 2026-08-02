"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const prisma_1 = require("../config/prisma");
/** Postgres `numeric` columns come back as strings via the driver — coerce defensively everywhere. */
const num = (v) => {
    if (v === null || v === undefined)
        return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const dayKey = (d) => d.toISOString().slice(0, 10);
const monthKey = (d) => d.toISOString().slice(0, 7);
/** Prisma always returns a Date object for @db.Date columns (TypeORM's `type: "date"`
 * columns read back as a plain "YYYY-MM-DD" string) — reformats it back to the same
 * string shape the frontend has always received wherever it's sent directly in a response. */
function formatDate(d) {
    return d ? new Date(d).toISOString().slice(0, 10) : null;
}
function getRangeBounds(range) {
    const end = new Date();
    let start;
    switch (range) {
        case "month":
            start = new Date(end.getFullYear(), end.getMonth(), 1);
            break;
        case "3m":
            start = new Date(end.getFullYear(), end.getMonth() - 3, end.getDate());
            break;
        case "12m":
            start = new Date(end.getFullYear(), end.getMonth() - 12, end.getDate());
            break;
        case "year":
            start = new Date(end.getFullYear(), 0, 1);
            break;
        case "30d":
        default:
            start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
    }
    return { start, end };
}
/** Buckets rows with a date into a per-day series across [start,end] — used for KPI sparklines. */
function dailySeries(rows, getDate, getValue, start, end) {
    const byDay = new Map();
    for (const r of rows) {
        const d = getDate(r);
        if (!d)
            continue;
        const key = dayKey(d);
        byDay.set(key, (byDay.get(key) || 0) + getValue(r));
    }
    const series = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= endDay) {
        const key = dayKey(cursor);
        series.push({ date: key, value: byDay.get(key) || 0 });
        cursor.setDate(cursor.getDate() + 1);
    }
    return series;
}
/** Second-half vs first-half of the series — an intake/activity trend, not a reconstructed balance. */
function trendPct(series) {
    if (series.length < 2)
        return 0;
    const mid = Math.floor(series.length / 2);
    const firstHalf = series.slice(0, mid).reduce((s, d) => s + d.value, 0);
    const secondHalf = series.slice(mid).reduce((s, d) => s + d.value, 0);
    if (firstHalf === 0)
        return secondHalf > 0 ? 100 : 0;
    return Math.round(((secondHalf - firstHalf) / Math.abs(firstHalf)) * 1000) / 10;
}
const AGING_BUCKETS = ["0-30 Days", "31-90 Days", "91-180 Days", "180+ Days"];
function agingBucket(days) {
    if (days <= 30)
        return "0-30 Days";
    if (days <= 90)
        return "31-90 Days";
    if (days <= 180)
        return "91-180 Days";
    return "180+ Days";
}
function statusFromDays(days) {
    if (days <= 30)
        return "Healthy";
    if (days <= 90)
        return "Slow Moving";
    if (days <= 180)
        return "Dead Stock";
    return "Critical";
}
function suggestedAction(status) {
    switch (status) {
        case "Healthy":
            return "Monitor";
        case "Slow Moving":
            return "Review reorder cadence";
        case "Dead Stock":
            return "Consider liquidation";
        default:
            return "Discontinue or write off";
    }
}
class ReportsController {
    /**
     * GET /organization/reports/summary — every dataset the Reports dashboard needs,
     * computed in one round-trip from data that already exists. Query params:
     * projectId?, warehouseId?, vendorId?, category?, range? (30d|month|3m|12m|year).
     *
     * Procurement-side figures are sourced from the PurchaseOrder pipeline (v2) rather
     * than the legacy ProcurementItem table — a PO's "cost" is the sum of its line
     * items' quantity*unitPrice. The old `category` (hardware/software/service)
     * dimension doesn't exist on PurchaseOrder/PurchaseOrderItem (the new PR/PO spec
     * never had a category field), so the `category` filter and `spendByCategory`
     * chart now apply to Inventory data only; `spendByCategory` is returned empty.
     */
    static getSummary = async (req, res) => {
        try {
            const wsId = req.organization.id;
            const { projectId, warehouseId, vendorId, category } = req.query;
            const { start, end } = getRangeBounds(req.query.range);
            const inventoryWhere = { project: { organizationId: wsId } };
            if (projectId)
                inventoryWhere.projectId = parseInt(projectId);
            if (warehouseId)
                inventoryWhere.warehouseId = parseInt(warehouseId);
            if (vendorId)
                inventoryWhere.vendorId = parseInt(vendorId);
            if (category)
                inventoryWhere.category = category;
            const purchaseOrderWhere = { organizationId: wsId };
            if (projectId)
                purchaseOrderWhere.projectId = parseInt(projectId);
            if (vendorId)
                purchaseOrderWhere.vendorId = parseInt(vendorId);
            const inventoryItems = await prisma_1.prisma.inventoryItem.findMany({
                where: inventoryWhere,
                include: { project: true, warehouse: true, vendor: true },
            });
            const purchaseOrders = await prisma_1.prisma.purchaseOrder.findMany({
                where: purchaseOrderWhere,
                include: { project: true, vendor: true, items: true },
            });
            const itemIds = inventoryItems.map((i) => i.id);
            const purchaseOrderIds = purchaseOrders.map((p) => p.id);
            const transactions = itemIds.length
                ? await prisma_1.prisma.inventoryTransaction.findMany({
                    where: { inventoryItemId: { in: itemIds } },
                    include: { inventoryItem: true },
                })
                : [];
            const statusHistory = purchaseOrderIds.length
                ? await prisma_1.prisma.purchaseOrderStatusHistory.findMany({
                    where: { purchaseOrderId: { in: purchaseOrderIds } },
                    orderBy: { createdAt: "asc" },
                })
                : [];
            const warehouses = await prisma_1.prisma.warehouse.findMany({
                where: warehouseId ? { id: parseInt(warehouseId), organizationId: wsId } : { organizationId: wsId },
            });
            const vendors = await prisma_1.prisma.vendor.findMany({
                where: vendorId ? { id: parseInt(vendorId), organizationId: wsId } : { organizationId: wsId },
            });
            const inRange = (d) => !!d && d >= start && d <= end;
            const transactionsInRange = transactions.filter((t) => inRange(t.createdAt));
            // ---- KPIs ----
            const totalInventoryValue = inventoryItems.reduce((s, i) => s + i.quantity * num(i.averageCost), 0);
            const valueSeries = dailySeries(transactionsInRange, (t) => t.createdAt, (t) => t.quantityChange * num(t.inventoryItem?.averageCost), start, end);
            const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
            const prevMonthStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
            const poCost = (po) => po.items.reduce((s, item) => s + item.quantity * num(item.unitPrice), 0);
            const monthlyProcurementCost = purchaseOrders
                .filter((p) => p.createdAt >= monthStart)
                .reduce((s, p) => s + poCost(p), 0);
            const prevMonthProcurementCost = purchaseOrders
                .filter((p) => p.createdAt >= prevMonthStart && p.createdAt < monthStart)
                .reduce((s, p) => s + poCost(p), 0);
            const costSeries = dailySeries(purchaseOrders.filter((p) => inRange(p.createdAt)), (p) => p.createdAt, poCost, start, end);
            const lowStockItems = inventoryItems.filter((i) => i.status === "low_stock");
            const outOfStockItems = inventoryItems.filter((i) => i.status === "out_of_stock");
            const activePOs = purchaseOrders.filter((p) => p.status !== "completed" && p.status !== "cancelled");
            const activeVendorIds = new Set(purchaseOrders.filter((p) => p.vendorId).map((p) => p.vendorId));
            const issuedInRange = transactionsInRange.filter((t) => t.type === "issue");
            const totalIssuedQty = issuedInRange.reduce((s, t) => s + Math.abs(t.quantityChange), 0);
            const avgOnHand = inventoryItems.length
                ? inventoryItems.reduce((s, i) => s + i.quantity, 0) / inventoryItems.length
                : 0;
            const inventoryTurnover = avgOnHand > 0 ? Math.round((totalIssuedQty / avgOnHand) * 100) / 100 : 0;
            const kpis = {
                totalInventoryValue: {
                    value: totalInventoryValue,
                    trendPct: trendPct(valueSeries),
                    sparkline: valueSeries,
                },
                monthlyProcurementCost: {
                    value: monthlyProcurementCost,
                    trendPct: prevMonthProcurementCost > 0
                        ? Math.round(((monthlyProcurementCost - prevMonthProcurementCost) / prevMonthProcurementCost) * 1000) / 10
                        : monthlyProcurementCost > 0
                            ? 100
                            : 0,
                    sparkline: costSeries,
                },
                totalInventoryItems: {
                    value: inventoryItems.length,
                    trendPct: trendPct(dailySeries(inventoryItems.filter((i) => inRange(i.createdAt)), (i) => i.createdAt, () => 1, start, end)),
                    sparkline: dailySeries(inventoryItems.filter((i) => inRange(i.createdAt)), (i) => i.createdAt, () => 1, start, end),
                },
                lowStockItems: {
                    value: lowStockItems.length,
                    trendPct: trendPct(dailySeries(lowStockItems.filter((i) => inRange(i.createdAt)), (i) => i.createdAt, () => 1, start, end)),
                    sparkline: dailySeries(lowStockItems.filter((i) => inRange(i.createdAt)), (i) => i.createdAt, () => 1, start, end),
                },
                outOfStockItems: {
                    value: outOfStockItems.length,
                    trendPct: trendPct(dailySeries(outOfStockItems.filter((i) => inRange(i.createdAt)), (i) => i.createdAt, () => 1, start, end)),
                    sparkline: dailySeries(outOfStockItems.filter((i) => inRange(i.createdAt)), (i) => i.createdAt, () => 1, start, end),
                },
                activePurchaseOrders: {
                    value: activePOs.length,
                    trendPct: trendPct(dailySeries(activePOs.filter((p) => inRange(p.createdAt)), (p) => p.createdAt, () => 1, start, end)),
                    sparkline: dailySeries(activePOs.filter((p) => inRange(p.createdAt)), (p) => p.createdAt, () => 1, start, end),
                },
                activeVendors: {
                    value: activeVendorIds.size,
                    trendPct: trendPct(dailySeries(purchaseOrders.filter((p) => p.vendorId && inRange(p.createdAt)), (p) => p.createdAt, () => 1, start, end)),
                    sparkline: dailySeries(purchaseOrders.filter((p) => p.vendorId && inRange(p.createdAt)), (p) => p.createdAt, () => 1, start, end),
                },
                inventoryTurnover: {
                    value: inventoryTurnover,
                    trendPct: trendPct(dailySeries(issuedInRange, (t) => t.createdAt, (t) => Math.abs(t.quantityChange), start, end)),
                    sparkline: dailySeries(issuedInRange, (t) => t.createdAt, (t) => Math.abs(t.quantityChange), start, end),
                },
            };
            // ---- Charts ----
            const procurementCostTrend = {};
            purchaseOrders
                .filter((p) => inRange(p.createdAt))
                .forEach((p) => {
                const key = monthKey(p.createdAt);
                procurementCostTrend[key] = (procurementCostTrend[key] || 0) + poCost(p);
            });
            const categories = ["hardware", "software", "service"];
            // Procurement no longer has a category dimension (see class-level doc comment above) —
            // kept as an empty array so the response shape/frontend chart doesn't break.
            const spendByCategory = [];
            const inventoryValueByCategory = categories.map((c) => ({
                category: c,
                value: inventoryItems.filter((i) => i.category === c).reduce((s, i) => s + i.quantity * num(i.averageCost), 0),
            }));
            const poStatuses = ["created", "sent", "accepted", "cancelled", "completed"];
            const poStatusBreakdown = poStatuses.map((s) => ({
                status: s,
                count: purchaseOrders.filter((p) => p.status === s).length,
            }));
            const warehouseUtilization = warehouses.map((w) => ({
                id: w.id,
                name: w.name,
                used: inventoryItems.filter((i) => i.warehouse?.id === w.id).reduce((s, i) => s + i.quantity, 0),
                capacity: w.capacity,
            }));
            const stockMovementTrend = {};
            transactionsInRange.forEach((t) => {
                const key = monthKey(t.createdAt);
                if (!stockMovementTrend[key])
                    stockMovementTrend[key] = { receipt: 0, issue: 0, adjustment: 0, transferred: 0 };
                const abs = Math.abs(t.quantityChange);
                if (t.type === "receipt")
                    stockMovementTrend[key].receipt += abs;
                else if (t.type === "issue")
                    stockMovementTrend[key].issue += abs;
                else if (t.type === "adjustment")
                    stockMovementTrend[key].adjustment += abs;
                else
                    stockMovementTrend[key].transferred += abs;
            });
            const yearStart = new Date(end.getFullYear(), 0, 1);
            const topPurchasedItems = [...purchaseOrders]
                .filter((p) => p.createdAt >= yearStart)
                .sort((a, b) => poCost(b) - poCost(a))
                .slice(0, 10)
                .map((p) => ({ id: p.id, itemName: p.items.map((i) => i.itemName).join(", ") || p.poNumber || `PO #${p.id}`, value: poCost(p) }));
            const consumptionByProject = new Map();
            inventoryItems.forEach((i) => {
                const name = i.project?.name || "Unassigned";
                consumptionByProject.set(name, (consumptionByProject.get(name) || 0) + i.quantity * num(i.averageCost));
            });
            const projectMaterialConsumption = Array.from(consumptionByProject.entries())
                .map(([projectName, value]) => ({ projectName, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 8);
            const lastMovementDate = (item) => {
                const itemTx = transactions.filter((t) => t.inventoryItem?.id === item.id);
                if (itemTx.length > 0) {
                    return itemTx.reduce((latest, t) => (t.createdAt > latest ? t.createdAt : latest), new Date(0));
                }
                return item.lastRestockedDate || item.createdAt;
            };
            // Clamped at 0 — a future-dated lastRestockedDate (a planned restock) must never
            // produce a negative "days since movement" figure.
            const daysSince = (d) => Math.max(0, Math.floor((end.getTime() - new Date(d).getTime()) / (24 * 60 * 60 * 1000)));
            const agingByCategory = categories.map((c) => {
                const row = { category: c };
                AGING_BUCKETS.forEach((b) => (row[b] = 0));
                inventoryItems
                    .filter((i) => i.category === c)
                    .forEach((i) => {
                    const days = daysSince(lastMovementDate(i));
                    row[agingBucket(days)] += i.quantity * num(i.averageCost);
                });
                return row;
            });
            const deadStock = inventoryItems.map((i) => {
                const days = daysSince(lastMovementDate(i));
                const status = statusFromDays(days);
                return {
                    id: i.id,
                    itemName: i.itemName,
                    sku: i.sku || null,
                    warehouse: i.warehouse?.name || null,
                    quantity: i.quantity,
                    value: i.quantity * num(i.averageCost),
                    daysSinceMovement: days,
                    category: i.category,
                    status,
                    suggestedAction: suggestedAction(status),
                };
            });
            // Vendor performance: avg days between a PO's "sent" and "completed" status-history rows.
            const vendorPerformance = vendors.map((v) => {
                const vendorPOs = purchaseOrders.filter((p) => p.vendorId === v.id);
                const deliveryDays = [];
                vendorPOs.forEach((p) => {
                    const rows = statusHistory.filter((h) => h.purchaseOrderId === p.id);
                    const sent = rows.find((h) => h.toStatus === "sent");
                    const completed = rows.find((h) => h.toStatus === "completed" && (!sent || h.createdAt > sent.createdAt));
                    if (sent && completed) {
                        deliveryDays.push((completed.createdAt.getTime() - sent.createdAt.getTime()) / (24 * 60 * 60 * 1000));
                    }
                });
                return {
                    id: v.id,
                    name: v.name,
                    avgDeliveryDays: deliveryDays.length > 0
                        ? Math.round((deliveryDays.reduce((s, d) => s + d, 0) / deliveryDays.length) * 10) / 10
                        : null,
                    purchaseVolume: vendorPOs.reduce((s, p) => s + poCost(p), 0),
                };
            });
            // ---- Alerts ----
            const now = new Date();
            const delayedPOs = purchaseOrders
                .filter((p) => p.status !== "completed" && p.deliveryDate && new Date(p.deliveryDate) < now)
                .map((p) => ({
                id: p.id,
                itemName: p.items.map((i) => i.itemName).join(", ") || p.poNumber || `PO #${p.id}`,
                neededByDate: formatDate(p.deliveryDate),
                vendorName: p.vendor?.name || null,
            }));
            const vendorDelays = [];
            purchaseOrders.forEach((p) => {
                if (!p.deliveryDate)
                    return;
                const completed = statusHistory.find((h) => h.purchaseOrderId === p.id && h.toStatus === "completed");
                if (completed && completed.createdAt > new Date(p.deliveryDate)) {
                    vendorDelays.push({
                        itemName: p.items.map((i) => i.itemName).join(", ") || p.poNumber || `PO #${p.id}`,
                        vendorName: p.vendor?.name || "Unknown vendor",
                        neededByDate: formatDate(p.deliveryDate),
                        deliveredAt: completed.createdAt,
                    });
                }
            });
            const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            const contractsExpiring = vendors
                .filter((v) => v.contractExpiryDate && new Date(v.contractExpiryDate) <= soon)
                .map((v) => ({ id: v.id, name: v.name, contractExpiryDate: formatDate(v.contractExpiryDate) }));
            // ---- Insights ----
            const inventoryValueTrendPct = kpis.totalInventoryValue.trendPct;
            const procurementCostTrendPct = kpis.monthlyProcurementCost.trendPct;
            const monthPOs = purchaseOrders.filter((p) => p.createdAt >= monthStart);
            const spendByVendorThisMonth = new Map();
            monthPOs.forEach((p) => {
                const name = p.vendor?.name || "Unknown";
                spendByVendorThisMonth.set(name, (spendByVendorThisMonth.get(name) || 0) + poCost(p));
            });
            const topVendorThisMonth = Array.from(spendByVendorThisMonth.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
            const lowestStockCategory = [...inventoryValueByCategory].sort((a, b) => a.value - b.value)[0]?.category || null;
            return res.status(200).json({
                range: { start, end },
                kpis,
                procurementCostTrend: Object.entries(procurementCostTrend).map(([month, value]) => ({ month, value })),
                spendByCategory,
                inventoryValueByCategory,
                poStatusBreakdown,
                warehouseUtilization,
                stockMovementTrend: Object.entries(stockMovementTrend).map(([month, v]) => ({ month, ...v })),
                topPurchasedItems,
                projectMaterialConsumption,
                inventoryAging: agingByCategory,
                vendorPerformance,
                deadStock,
                alerts: {
                    delayedPOs,
                    vendorDelays,
                    contractsExpiring,
                    pendingAudits: [],
                },
                insights: {
                    inventoryValueTrendPct,
                    procurementCostTrendPct,
                    topVendorThisMonth,
                    highestConsumingProject: projectMaterialConsumption[0]?.projectName || null,
                    lowestStockCategory,
                },
            });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /organization/reports/activity?action=viewed|exported — footer's Recent Exports / Recently Viewed. */
    static getReportActivity = async (req, res) => {
        try {
            const { action } = req.query;
            const activity = await prisma_1.prisma.reportActivity.findMany({
                where: action
                    ? { organizationId: req.organization.id, action }
                    : { organizationId: req.organization.id },
                include: { performedBy: true },
                orderBy: { createdAt: "desc" },
                take: 20,
            });
            return res.status(200).json({ activity });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /organization/reports/activity — log a view/export action. */
    static logReportActivity = async (req, res) => {
        const { reportType, action, format } = req.body;
        if (!reportType || !action) {
            return res.status(400).json({ message: "reportType and action are required" });
        }
        try {
            const performedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const activity = await prisma_1.prisma.reportActivity.create({
                data: {
                    reportType,
                    action,
                    organizationId: req.organization.id,
                    ...(format ? { format } : {}),
                    ...(performedBy ? { performedById: performedBy.id } : {}),
                },
            });
            return res.status(201).json({ message: "Activity logged", activity });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /organization/reports/comments?key=... — comments for one chart/section. */
    static getReportComments = async (req, res) => {
        const { key } = req.query;
        if (!key)
            return res.status(400).json({ message: "key is required" });
        try {
            const comments = await prisma_1.prisma.reportComment.findMany({
                where: { organizationId: req.organization.id, reportKey: key },
                include: { createdBy: true },
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json({ comments });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /organization/reports/comments — add a comment to a chart/section. */
    static addReportComment = async (req, res) => {
        const { reportKey, body } = req.body;
        if (!reportKey || !body || !body.trim()) {
            return res.status(400).json({ message: "reportKey and body are required" });
        }
        try {
            const createdBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const comment = await prisma_1.prisma.reportComment.create({
                data: {
                    reportKey,
                    body: body.trim(),
                    organizationId: req.organization.id,
                    ...(createdBy ? { createdById: createdBy.id } : {}),
                },
            });
            return res.status(201).json({ message: "Comment added", comment });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.ReportsController = ReportsController;
//# sourceMappingURL=ReportsController.js.map