import { Response } from "express";
import { Between, In } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { InventoryItem, InventoryCategory } from "../entities/InventoryItem";
import { ProcurementItem } from "../entities/ProcurementItem";
import { InventoryTransaction } from "../entities/InventoryTransaction";
import { ProcurementStatusHistory } from "../entities/ProcurementStatusHistory";
import { Warehouse } from "../entities/Warehouse";
import { Vendor } from "../entities/Vendor";
import { ReportComment } from "../entities/ReportComment";
import { ReportActivity, ReportActivityAction } from "../entities/ReportActivity";
import { User } from "../entities/User";
import { AuthRequest } from "../middlewares/auth";

/** Postgres `numeric` columns come back as strings via the driver — coerce defensively everywhere. */
const num = (v: any): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

type RangeKey = "30d" | "month" | "3m" | "12m" | "year";

function getRangeBounds(range?: string) {
  const end = new Date();
  let start: Date;
  switch (range as RangeKey) {
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
function dailySeries<T>(
  rows: T[],
  getDate: (r: T) => Date | undefined,
  getValue: (r: T) => number,
  start: Date,
  end: Date,
) {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = getDate(r);
    if (!d) continue;
    const key = dayKey(d);
    byDay.set(key, (byDay.get(key) || 0) + getValue(r));
  }
  const series: { date: string; value: number }[] = [];
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
function trendPct(series: { value: number }[]) {
  if (series.length < 2) return 0;
  const mid = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, mid).reduce((s, d) => s + d.value, 0);
  const secondHalf = series.slice(mid).reduce((s, d) => s + d.value, 0);
  if (firstHalf === 0) return secondHalf > 0 ? 100 : 0;
  return Math.round(((secondHalf - firstHalf) / Math.abs(firstHalf)) * 1000) / 10;
}

const AGING_BUCKETS = ["0-30 Days", "31-90 Days", "91-180 Days", "180+ Days"] as const;
function agingBucket(days: number): (typeof AGING_BUCKETS)[number] {
  if (days <= 30) return "0-30 Days";
  if (days <= 90) return "31-90 Days";
  if (days <= 180) return "91-180 Days";
  return "180+ Days";
}
function statusFromDays(days: number): "Healthy" | "Slow Moving" | "Dead Stock" | "Critical" {
  if (days <= 30) return "Healthy";
  if (days <= 90) return "Slow Moving";
  if (days <= 180) return "Dead Stock";
  return "Critical";
}
function suggestedAction(status: string): string {
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

export class ReportsController {
  /**
   * GET /workspace/reports/summary — every dataset the Reports dashboard needs,
   * computed in one round-trip from data that already exists. Query params:
   * projectId?, warehouseId?, vendorId?, category?, range? (30d|month|3m|12m|year).
   */
  static getSummary = async (req: AuthRequest, res: Response) => {
    try {
      const wsId = req.workspace!.id;
      const { projectId, warehouseId, vendorId, category } = req.query as Record<string, string | undefined>;
      const { start, end } = getRangeBounds(req.query.range as string | undefined);

      const inventoryWhere: any = { project: { workspace: { id: wsId } } };
      if (projectId) inventoryWhere.project.id = parseInt(projectId);
      if (warehouseId) inventoryWhere.warehouse = { id: parseInt(warehouseId) };
      if (vendorId) inventoryWhere.vendor = { id: parseInt(vendorId) };
      if (category) inventoryWhere.category = category as InventoryCategory;

      const procurementWhere: any = { project: { workspace: { id: wsId } } };
      if (projectId) procurementWhere.project.id = parseInt(projectId);
      if (vendorId) procurementWhere.vendor = { id: parseInt(vendorId) };
      if (category) procurementWhere.category = category;

      const inventoryItems = await AppDataSource.getRepository(InventoryItem).find({
        where: inventoryWhere,
        relations: ["project", "warehouse", "vendor"],
      });
      const procurementItems = await AppDataSource.getRepository(ProcurementItem).find({
        where: procurementWhere,
        relations: ["project", "vendor", "requestedBy"],
      });

      const itemIds = inventoryItems.map((i) => i.id);
      const procurementIds = procurementItems.map((p) => p.id);

      const transactions = itemIds.length
        ? await AppDataSource.getRepository(InventoryTransaction).find({
            where: { inventoryItem: { id: In(itemIds) } },
            relations: ["inventoryItem"],
          })
        : [];
      const statusHistory = procurementIds.length
        ? await AppDataSource.getRepository(ProcurementStatusHistory).find({
            where: { procurementItem: { id: In(procurementIds) } },
            relations: ["procurementItem", "procurementItem.vendor"],
            order: { createdAt: "ASC" },
          })
        : [];

      const warehouses = await AppDataSource.getRepository(Warehouse).find({
        where: warehouseId ? { id: parseInt(warehouseId), workspace: { id: wsId } } : { workspace: { id: wsId } },
      });
      const vendors = await AppDataSource.getRepository(Vendor).find({
        where: vendorId ? { id: parseInt(vendorId), workspace: { id: wsId } } : { workspace: { id: wsId } },
      });

      const inRange = (d?: Date | null) => !!d && d >= start && d <= end;
      const transactionsInRange = transactions.filter((t) => inRange(t.createdAt));

      // ---- KPIs ----
      const totalInventoryValue = inventoryItems.reduce((s, i) => s + i.quantity * num(i.averageCost), 0);
      const valueSeries = dailySeries(
        transactionsInRange,
        (t) => t.createdAt,
        (t) => t.quantityChange * num(t.inventoryItem?.averageCost),
        start,
        end,
      );

      const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
      const prevMonthStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      const poCost = (p: ProcurementItem) => p.quantity * num(p.unitCost ?? p.estimatedCost);
      const monthlyProcurementCost = procurementItems
        .filter((p) => p.createdAt >= monthStart)
        .reduce((s, p) => s + poCost(p), 0);
      const prevMonthProcurementCost = procurementItems
        .filter((p) => p.createdAt >= prevMonthStart && p.createdAt < monthStart)
        .reduce((s, p) => s + poCost(p), 0);
      const costSeries = dailySeries(
        procurementItems.filter((p) => inRange(p.createdAt)),
        (p) => p.createdAt,
        poCost,
        start,
        end,
      );

      const lowStockItems = inventoryItems.filter((i) => i.status === "low_stock");
      const outOfStockItems = inventoryItems.filter((i) => i.status === "out_of_stock");
      const activePOs = procurementItems.filter((p) => p.status !== "delivered");
      const activeVendorIds = new Set(procurementItems.filter((p) => p.vendor).map((p) => p.vendor!.id));

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
          trendPct:
            prevMonthProcurementCost > 0
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
          trendPct: trendPct(
            dailySeries(procurementItems.filter((p) => p.vendor && inRange(p.createdAt)), (p) => p.createdAt, () => 1, start, end),
          ),
          sparkline: dailySeries(
            procurementItems.filter((p) => p.vendor && inRange(p.createdAt)),
            (p) => p.createdAt,
            () => 1,
            start,
            end,
          ),
        },
        inventoryTurnover: {
          value: inventoryTurnover,
          trendPct: trendPct(dailySeries(issuedInRange, (t) => t.createdAt, (t) => Math.abs(t.quantityChange), start, end)),
          sparkline: dailySeries(issuedInRange, (t) => t.createdAt, (t) => Math.abs(t.quantityChange), start, end),
        },
      };

      // ---- Charts ----
      const procurementCostTrend: Record<string, number> = {};
      procurementItems
        .filter((p) => inRange(p.createdAt))
        .forEach((p) => {
          const key = monthKey(p.createdAt);
          procurementCostTrend[key] = (procurementCostTrend[key] || 0) + poCost(p);
        });

      const categories: InventoryCategory[] = ["hardware", "software", "service"];
      const spendByCategory = categories.map((c) => ({
        category: c,
        value: procurementItems.filter((p) => p.category === c).reduce((s, p) => s + poCost(p), 0),
      }));
      const inventoryValueByCategory = categories.map((c) => ({
        category: c,
        value: inventoryItems.filter((i) => i.category === c).reduce((s, i) => s + i.quantity * num(i.averageCost), 0),
      }));

      const poStatuses: ProcurementItem["status"][] = ["pending", "approved", "ordered", "delivered"];
      const poStatusBreakdown = poStatuses.map((s) => ({
        status: s,
        count: procurementItems.filter((p) => p.status === s).length,
      }));

      const warehouseUtilization = warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        used: inventoryItems.filter((i) => i.warehouse?.id === w.id).reduce((s, i) => s + i.quantity, 0),
        capacity: w.capacity,
      }));

      const stockMovementTrend: Record<string, { receipt: number; issue: number; adjustment: number; transferred: number }> = {};
      transactionsInRange.forEach((t) => {
        const key = monthKey(t.createdAt);
        if (!stockMovementTrend[key]) stockMovementTrend[key] = { receipt: 0, issue: 0, adjustment: 0, transferred: 0 };
        const abs = Math.abs(t.quantityChange);
        if (t.type === "receipt") stockMovementTrend[key].receipt += abs;
        else if (t.type === "issue") stockMovementTrend[key].issue += abs;
        else if (t.type === "adjustment") stockMovementTrend[key].adjustment += abs;
        else stockMovementTrend[key].transferred += abs;
      });

      const yearStart = new Date(end.getFullYear(), 0, 1);
      const topPurchasedItems = [...procurementItems]
        .filter((p) => p.createdAt >= yearStart)
        .sort((a, b) => poCost(b) - poCost(a))
        .slice(0, 10)
        .map((p) => ({ id: p.id, itemName: p.itemName, value: poCost(p) }));

      const consumptionByProject = new Map<string, number>();
      inventoryItems.forEach((i) => {
        const name = i.project?.name || "Unassigned";
        consumptionByProject.set(name, (consumptionByProject.get(name) || 0) + i.quantity * num(i.averageCost));
      });
      const projectMaterialConsumption = Array.from(consumptionByProject.entries())
        .map(([projectName, value]) => ({ projectName, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      const lastMovementDate = (item: InventoryItem): Date => {
        const itemTx = transactions.filter((t) => t.inventoryItem?.id === item.id);
        if (itemTx.length > 0) {
          return itemTx.reduce(
            (latest: Date, t) => (t.createdAt > latest ? t.createdAt : latest),
            new Date(0),
          );
        }
        return item.lastRestockedDate || item.createdAt;
      };
      // Clamped at 0 — a future-dated lastRestockedDate (a planned restock) must never
      // produce a negative "days since movement" figure.
      const daysSince = (d: Date) => Math.max(0, Math.floor((end.getTime() - new Date(d).getTime()) / (24 * 60 * 60 * 1000)));

      const agingByCategory = categories.map((c) => {
        const row: any = { category: c };
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

      // Vendor performance: avg days between a PO's "ordered" and "delivered" status-history rows.
      const vendorPerformance = vendors.map((v) => {
        const vendorPOs = procurementItems.filter((p) => p.vendor?.id === v.id);
        const deliveryDays: number[] = [];
        vendorPOs.forEach((p) => {
          const rows = statusHistory.filter((h) => h.procurementItem.id === p.id);
          const ordered = rows.find((h) => h.toStatus === "ordered");
          const delivered = rows.find((h) => h.toStatus === "delivered" && (!ordered || h.createdAt > ordered.createdAt));
          if (ordered && delivered) {
            deliveryDays.push((delivered.createdAt.getTime() - ordered.createdAt.getTime()) / (24 * 60 * 60 * 1000));
          }
        });
        return {
          id: v.id,
          name: v.name,
          rating: v.rating ?? null,
          avgDeliveryDays:
            deliveryDays.length > 0
              ? Math.round((deliveryDays.reduce((s, d) => s + d, 0) / deliveryDays.length) * 10) / 10
              : null,
          purchaseVolume: vendorPOs.reduce((s, p) => s + poCost(p), 0),
        };
      });

      // ---- Alerts ----
      const now = new Date();
      const delayedPOs = procurementItems
        .filter((p) => p.status !== "delivered" && p.neededByDate && new Date(p.neededByDate) < now)
        .map((p) => ({ id: p.id, itemName: p.itemName, neededByDate: p.neededByDate, vendorName: p.vendor?.name || p.vendorName || null }));

      const vendorDelays: { itemName: string; vendorName: string; neededByDate: Date; deliveredAt: Date }[] = [];
      procurementItems.forEach((p) => {
        if (!p.neededByDate) return;
        const delivered = statusHistory.find((h) => h.procurementItem.id === p.id && h.toStatus === "delivered");
        if (delivered && delivered.createdAt > new Date(p.neededByDate)) {
          vendorDelays.push({
            itemName: p.itemName,
            vendorName: p.vendor?.name || p.vendorName || "Unknown vendor",
            neededByDate: p.neededByDate,
            deliveredAt: delivered.createdAt,
          });
        }
      });

      const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const contractsExpiring = vendors
        .filter((v) => v.contractExpiryDate && new Date(v.contractExpiryDate) <= soon)
        .map((v) => ({ id: v.id, name: v.name, contractExpiryDate: v.contractExpiryDate }));

      // ---- Insights ----
      const inventoryValueTrendPct = kpis.totalInventoryValue.trendPct;
      const procurementCostTrendPct = kpis.monthlyProcurementCost.trendPct;
      const monthPOs = procurementItems.filter((p) => p.createdAt >= monthStart);
      const spendByVendorThisMonth = new Map<string, number>();
      monthPOs.forEach((p) => {
        const name = p.vendor?.name || p.vendorName || "Unknown";
        spendByVendorThisMonth.set(name, (spendByVendorThisMonth.get(name) || 0) + poCost(p));
      });
      const topVendorThisMonth =
        Array.from(spendByVendorThisMonth.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
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
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /workspace/reports/activity?action=viewed|exported — footer's Recent Exports / Recently Viewed. */
  static getReportActivity = async (req: AuthRequest, res: Response) => {
    try {
      const { action } = req.query as { action?: ReportActivityAction };
      const activityRepository = AppDataSource.getRepository(ReportActivity);
      const activity = await activityRepository.find({
        where: action ? { workspace: { id: req.workspace!.id }, action } : { workspace: { id: req.workspace!.id } },
        relations: ["performedBy"],
        order: { createdAt: "DESC" },
        take: 20,
      });
      return res.status(200).json({ activity });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /workspace/reports/activity — log a view/export action. */
  static logReportActivity = async (req: AuthRequest, res: Response) => {
    const { reportType, action, format } = req.body as { reportType: string; action: ReportActivityAction; format?: string };
    if (!reportType || !action) {
      return res.status(400).json({ message: "reportType and action are required" });
    }
    try {
      const userRepository = AppDataSource.getRepository(User);
      const performedBy = await userRepository.findOneBy({ id: req.user!.id });
      const activityRepository = AppDataSource.getRepository(ReportActivity);
      const activity = activityRepository.create({
        reportType,
        action,
        workspace: req.workspace!,
        ...(format ? { format } : {}),
        ...(performedBy ? { performedBy } : {}),
      });
      await activityRepository.save(activity);
      return res.status(201).json({ message: "Activity logged", activity });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** GET /workspace/reports/comments?key=... — comments for one chart/section. */
  static getReportComments = async (req: AuthRequest, res: Response) => {
    const { key } = req.query as { key?: string };
    if (!key) return res.status(400).json({ message: "key is required" });
    try {
      const comments = await AppDataSource.getRepository(ReportComment).find({
        where: { workspace: { id: req.workspace!.id }, reportKey: key },
        relations: ["createdBy"],
        order: { createdAt: "DESC" },
      });
      return res.status(200).json({ comments });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /workspace/reports/comments — add a comment to a chart/section. */
  static addReportComment = async (req: AuthRequest, res: Response) => {
    const { reportKey, body } = req.body as { reportKey: string; body: string };
    if (!reportKey || !body || !body.trim()) {
      return res.status(400).json({ message: "reportKey and body are required" });
    }
    try {
      const userRepository = AppDataSource.getRepository(User);
      const createdBy = await userRepository.findOneBy({ id: req.user!.id });
      const commentRepository = AppDataSource.getRepository(ReportComment);
      const comment = commentRepository.create({
        reportKey,
        body: body.trim(),
        workspace: req.workspace!,
        ...(createdBy ? { createdBy } : {}),
      });
      await commentRepository.save(comment);
      return res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
