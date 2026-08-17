import { Response } from "express";
import { prisma } from "../config/prisma";
import { UserRole } from "../types/enums";
import { AuthRequest } from "../middlewares/auth";
import {
  SavePlantReportDto,
  PlantReportFieldDataType,
  PlantReportItemEntryInput,
} from "../dto/plant-report.dto";

const toNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/** Parses a "YYYY-MM-DD" date string as a UTC midnight Date — matches how
 * the `date` column (Postgres `date`, no time component) round-trips
 * through Prisma, and avoids the local-timezone-shift bug plain
 * `new Date("YYYY-MM-DD")` doesn't have but `new Date(y, m, d)` would. */
const parseDateOnly = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const REPORT_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  project: { select: { id: true, name: true } },
  staff: { include: { user: { select: { id: true, fullName: true } } } },
  itemEntries: { include: { item: true } },
} as const;

/** Flattens the raw Decimal/join-row shape into plain numbers, and adds the
 * derived figures (steam ton, water flow, pellet stock closing) computed
 * from the raw readings rather than stored — see schema.prisma's comment on
 * PlantDailyReport for why. */
const shapeReport = (report: any) => {
  const steamInitial = toNum(report.steamInitial);
  const steamFinal = toNum(report.steamFinal);
  const waterInitial = toNum(report.waterInitial);
  const waterFinal = toNum(report.waterFinal);
  const pelletStockOpening = toNum(report.pelletStockOpening) ?? 0;
  const pelletReceivedKg = toNum(report.pelletReceivedKg) ?? 0;
  const pelletUsedKg = toNum(report.pelletUsedKg) ?? 0;

  return {
    id: report.id,
    date: report.date.toISOString().slice(0, 10),
    steamInitial,
    steamFinal,
    steamTon: steamInitial != null && steamFinal != null ? steamFinal - steamInitial : null,
    steamPressure: toNum(report.steamPressure),
    steamTemp: toNum(report.steamTemp),
    feedwaterTemp: toNum(report.feedwaterTemp),
    pelletUsedKg: toNum(report.pelletUsedKg),
    pelletsBag: toNum(report.pelletsBag),
    pelletReceivedKg: toNum(report.pelletReceivedKg),
    pelletStockOpening,
    pelletStockClosing: pelletStockOpening + pelletReceivedKg - pelletUsedKg,
    waterInitial,
    waterFinal,
    waterFlow: waterInitial != null && waterFinal != null ? waterFinal - waterInitial : null,
    burnerStatus: report.burnerStatus,
    burnerHours: toNum(report.burnerHours),
    shutdownReason: report.shutdownReason,
    customValues: report.customValues ?? {},
    items: Array.isArray(report.itemEntries)
      ? report.itemEntries.map((e: any) => {
          const opening = toNum(e.openingStock) ?? 0;
          const received = toNum(e.receivedQty) ?? 0;
          const used = toNum(e.usedQty) ?? 0;
          return {
            itemId: e.itemId,
            name: e.item.name,
            unit: e.item.unit,
            trackStock: e.item.trackStock,
            opening,
            received,
            used,
            closing: opening + received - used,
            note: e.note,
          };
        })
      : [],
    staff: Array.isArray(report.staff) ? report.staff.map((s: any) => s.user) : [],
    staffCount: Array.isArray(report.staff) ? report.staff.length : 0,
    project: report.project,
    createdBy: report.createdBy,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
};

/** The most recent report strictly before `date` for this organization+project
 * (pellet stock is tracked per plant, not shared across an organization's
 * projects) — its computed closing balance becomes the new entry's opening
 * balance. */
async function previousClosingBalance(
  organizationId: number,
  projectId: number | null,
  date: Date,
): Promise<number> {
  const prev = await prisma.plantDailyReport.findFirst({
    where: { organizationId, projectId, date: { lt: date } },
    orderBy: { date: "desc" },
  });
  if (!prev) return 0;
  const opening = toNum(prev.pelletStockOpening) ?? 0;
  const received = toNum(prev.pelletReceivedKg) ?? 0;
  const used = toNum(prev.pelletUsedKg) ?? 0;
  return opening + received - used;
}

/** The most recent entry strictly before `date` for this item on this
 * organization+project — its derived closing balance becomes the new
 * entry's opening balance. Generalized version of previousClosingBalance,
 * keyed by item instead of hardcoded to pellets. */
async function previousItemClosingBalance(
  organizationId: number,
  projectId: number | null,
  itemId: number,
  date: Date,
): Promise<number> {
  const prevEntry = await prisma.plantReportItemEntry.findFirst({
    where: {
      itemId,
      report: { organizationId, projectId, date: { lt: date } },
    },
    orderBy: { report: { date: "desc" } },
  });
  if (!prevEntry) return 0;
  const opening = toNum(prevEntry.openingStock) ?? 0;
  const received = toNum(prevEntry.receivedQty) ?? 0;
  const used = toNum(prevEntry.usedQty) ?? 0;
  return opening + received - used;
}

/** Validates the incoming item-entry payload against this organization's
 * defined items (dropping any itemId that isn't one of them — same
 * tolerance as coerceCustomValues), and snapshots each entry's opening
 * stock from the previous report's closing balance for that item. */
async function resolveItemEntries(
  organizationId: number,
  projectId: number | null,
  date: Date,
  raw: PlantReportItemEntryInput[] | undefined,
): Promise<
  Array<{
    itemId: number;
    openingStock: number;
    receivedQty: number | null;
    usedQty: number | null;
    note: string | null;
  }>
> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const orgItems = await prisma.plantReportItem.findMany({ where: { organizationId } });
  const validIds = new Set(orgItems.map((i) => i.id));

  const result = [];
  for (const entry of raw) {
    if (!validIds.has(entry.itemId)) continue; // stale/tampered itemId — drop, same tolerance as customValues
    const openingStock = await previousItemClosingBalance(organizationId, projectId, entry.itemId, date);
    result.push({
      itemId: entry.itemId,
      openingStock,
      receivedQty: entry.receivedQty ?? null,
      usedQty: entry.usedQty ?? null,
      note: entry.note?.trim() || null,
    });
  }
  return result;
}

/** Parses+validates a projectId that must belong to this organization —
 * returns null for an absent/empty value (meaning "no project" / "all
 * projects", depending on call site), or throws a 400-worthy Error for a
 * value that doesn't parse or isn't one of this organization's projects. */
async function resolveProjectId(
  organizationId: number,
  raw: unknown,
): Promise<number | null> {
  if (raw === undefined || raw === null || raw === "") return null;
  const projectId = Number(raw);
  if (!Number.isInteger(projectId)) throw new Error("Invalid project id");
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  if (!project) throw new Error("Project not found in this organization");
  return projectId;
}

/** Coerces one raw custom-field value to match its field's declared
 * dataType — an empty/unparseable value becomes null rather than rejecting
 * the whole save, since these are optional extra columns, not required
 * plant readings. */
function coerceCustomValue(
  value: unknown,
  dataType: PlantReportFieldDataType,
): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  switch (dataType) {
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      return Boolean(value);
    case "date": {
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    }
    case "text":
    default:
      return String(value).trim() || null;
  }
}

/** Validates+coerces a report's customValues payload against this
 * organization's defined custom fields: drops any key that isn't a real
 * field id for this organization (stale field picked up from a stale form,
 * or a tampered request), and coerces the rest per-field to match its
 * dataType. */
async function coerceCustomValues(
  organizationId: number,
  raw: Record<string, unknown> | undefined,
): Promise<Record<string, string | number | boolean | null>> {
  if (!raw || typeof raw !== "object") return {};
  const fields = await prisma.plantReportCustomField.findMany({ where: { organizationId } });
  const result: Record<string, string | number | boolean | null> = {};
  for (const field of fields) {
    const key = String(field.id);
    if (!(key in raw)) continue;
    result[key] = coerceCustomValue(raw[key], field.dataType as PlantReportFieldDataType);
  }
  return result;
}

/** Whether `actor` may edit/delete a report they didn't create themselves. */
const canManage = (report: { createdById: number | null }, actorId: number, actorRole: string) =>
  report.createdById === actorId ||
  actorRole === UserRole.ADMIN ||
  actorRole === UserRole.SUPER_ADMIN;

export class PlantReportController {
  /** GET /plant-reports?year=&month= — every entry for that calendar month,
   * plus a totals/averages summary for the report/table view. Defaults to
   * the current year/month if not given. */
  static getMonth = async (req: AuthRequest, res: Response) => {
    try {
      const organizationId = req.organization!.id;
      const now = new Date();
      const year = parseInt((req.query.year as string) || String(now.getUTCFullYear()), 10);
      const month = parseInt((req.query.month as string) || String(now.getUTCMonth() + 1), 10);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: "Invalid year or month" });
      }

      const rangeStart = new Date(Date.UTC(year, month - 1, 1));
      const rangeEnd = new Date(Date.UTC(year, month, 1));

      // Omitted entirely = every project for this organization (a combined
      // total across all plants); given = just that one project's entries.
      let projectId: number | null = null;
      try {
        projectId = await resolveProjectId(organizationId, req.query.projectId);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }

      const reports = await prisma.plantDailyReport.findMany({
        where: {
          organizationId,
          date: { gte: rangeStart, lt: rangeEnd },
          ...(req.query.projectId ? { projectId } : {}),
        },
        include: REPORT_INCLUDE,
        orderBy: [{ date: "asc" }, { projectId: "asc" }],
      });

      const shaped = reports.map(shapeReport);
      const sum = (vals: Array<number | null>) =>
        vals.reduce((acc: number | null, v) => (v == null ? acc : (acc ?? 0) + v), null as number | null);
      const avg = (vals: Array<number | null>) => {
        const present = vals.filter((v): v is number => v != null);
        return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
      };

      // Per-item totals across the month (Pellets, Diesel, ...) — generalizes
      // the old totalPelletUsedKg/totalPelletReceivedKg pair below (kept for
      // backward compatibility with historical rows written before items
      // existed) to any number of org-defined items.
      const itemTotalsByItemId = new Map<
        number,
        { itemId: number; name: string; unit: string; totalUsed: number | null; totalReceived: number | null }
      >();
      for (const r of shaped) {
        for (const it of r.items) {
          const cur = itemTotalsByItemId.get(it.itemId) ?? {
            itemId: it.itemId,
            name: it.name,
            unit: it.unit,
            totalUsed: null,
            totalReceived: null,
          };
          if (it.used != null) cur.totalUsed = (cur.totalUsed ?? 0) + it.used;
          if (it.received != null) cur.totalReceived = (cur.totalReceived ?? 0) + it.received;
          itemTotalsByItemId.set(it.itemId, cur);
        }
      }

      const summary = {
        totalSteamTon: sum(shaped.map((r) => r.steamTon)),
        avgSteamPressure: avg(shaped.map((r) => r.steamPressure)),
        avgSteamTemp: avg(shaped.map((r) => r.steamTemp)),
        totalPelletUsedKg: sum(shaped.map((r) => r.pelletUsedKg)),
        totalPelletReceivedKg: sum(shaped.map((r) => r.pelletReceivedKg)),
        itemTotals: Array.from(itemTotalsByItemId.values()),
        totalWaterFlow: sum(shaped.map((r) => r.waterFlow)),
        totalBurnerHours: sum(shaped.map((r) => r.burnerHours)),
        shutdownDays: shaped.filter((r) => r.steamTon === 0 || r.burnerStatus === "stopped").length,
        daysLogged: shaped.length,
      };

      return res.status(200).json({ reports: shaped, summary, year, month });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /plant-reports/prefill?date=YYYY-MM-DD&projectId= — what the entry
   * form should show before the operator types anything: whether an entry
   * for this project+date already exists (so the form can switch to edit
   * mode) and, if not, the opening pellet balance carried over from that
   * project's previous day. */
  static getPrefill = async (req: AuthRequest, res: Response) => {
    try {
      const organizationId = req.organization!.id;
      const date = parseDateOnly((req.query.date as string) || "");
      if (!date) return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });

      let projectId: number | null;
      try {
        projectId = await resolveProjectId(organizationId, req.query.projectId);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }

      const existing = await prisma.plantDailyReport.findFirst({
        where: { organizationId, projectId, date },
        include: REPORT_INCLUDE,
      });

      if (existing) {
        return res.status(200).json({ exists: true, report: shapeReport(existing) });
      }

      const openingBalance = await previousClosingBalance(organizationId, projectId, date);

      // Each active tracked item's projected opening balance for this new
      // entry — same purpose as `openingBalance` above (pellets), just
      // generalized, so the form can show a correct opening figure per item
      // before the operator has saved anything.
      const items = await prisma.plantReportItem.findMany({
        where: { organizationId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      const itemOpeningBalances: Record<string, number> = {};
      for (const item of items) {
        itemOpeningBalances[String(item.id)] = await previousItemClosingBalance(
          organizationId,
          projectId,
          item.id,
          date,
        );
      }

      return res.status(200).json({ exists: false, openingBalance, itemOpeningBalances });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static create = async (req: AuthRequest, res: Response) => {
    const body: SavePlantReportDto = req.body;
    const date = parseDateOnly(body.date || "");
    if (!date) return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });

    if (
      body.steamInitial != null &&
      body.steamFinal != null &&
      Number(body.steamFinal) < Number(body.steamInitial)
    ) {
      return res.status(400).json({ message: "Steam final reading cannot be less than the initial reading" });
    }
    if (
      body.waterInitial != null &&
      body.waterFinal != null &&
      Number(body.waterFinal) < Number(body.waterInitial)
    ) {
      return res.status(400).json({ message: "Water final reading cannot be less than the initial reading" });
    }

    const steamTon =
      body.steamInitial != null && body.steamFinal != null
        ? Number(body.steamFinal) - Number(body.steamInitial)
        : null;
    const shutdownRequired = steamTon === 0 || body.burnerStatus === "stopped";
    if (shutdownRequired && !body.shutdownReason?.trim()) {
      return res.status(400).json({
        message: "A shutdown reason is required when steam ton is 0 or the burner is stopped",
      });
    }

    try {
      const organizationId = req.organization!.id;
      let projectId: number | null;
      try {
        projectId = await resolveProjectId(organizationId, body.projectId);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
      const pelletStockOpening = await previousClosingBalance(organizationId, projectId, date);
      const staffUserIds = Array.isArray(body.staffUserIds) ? [...new Set(body.staffUserIds)] : [];
      const customValues = await coerceCustomValues(organizationId, body.customValues);
      const itemEntries = await resolveItemEntries(organizationId, projectId, date, body.itemEntries);

      const created = await prisma.$transaction(async (tx) => {
        const report = await tx.plantDailyReport.create({
          data: {
            organizationId,
            projectId,
            date,
            steamInitial: body.steamInitial ?? null,
            steamFinal: body.steamFinal ?? null,
            steamPressure: body.steamPressure ?? null,
            steamTemp: body.steamTemp ?? null,
            feedwaterTemp: body.feedwaterTemp ?? null,
            pelletUsedKg: body.pelletUsedKg ?? null,
            pelletsBag: body.pelletsBag ?? null,
            pelletReceivedKg: body.pelletReceivedKg ?? null,
            pelletStockOpening,
            waterInitial: body.waterInitial ?? null,
            waterFinal: body.waterFinal ?? null,
            burnerStatus: body.burnerStatus ?? null,
            burnerHours: body.burnerHours ?? null,
            shutdownReason: body.shutdownReason?.trim() || null,
            customValues,
            createdById: req.user!.id,
          },
        });
        if (staffUserIds.length > 0) {
          await tx.plantReportStaff.createMany({
            data: staffUserIds.map((userId) => ({ reportId: report.id, userId })),
          });
        }
        if (itemEntries.length > 0) {
          await tx.plantReportItemEntry.createMany({
            data: itemEntries.map((e) => ({ ...e, reportId: report.id })),
          });
        }
        return tx.plantDailyReport.findUniqueOrThrow({
          where: { id: report.id },
          include: REPORT_INCLUDE,
        });
      });

      return res.status(201).json({ report: shapeReport(created) });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({ message: "A report for this date already exists" });
      }
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static update = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const body: SavePlantReportDto = req.body;
    const reportId = parseInt(id as string, 10);
    if (!Number.isInteger(reportId)) return res.status(400).json({ message: "Invalid report id" });

    if (
      body.steamInitial != null &&
      body.steamFinal != null &&
      Number(body.steamFinal) < Number(body.steamInitial)
    ) {
      return res.status(400).json({ message: "Steam final reading cannot be less than the initial reading" });
    }
    if (
      body.waterInitial != null &&
      body.waterFinal != null &&
      Number(body.waterFinal) < Number(body.waterInitial)
    ) {
      return res.status(400).json({ message: "Water final reading cannot be less than the initial reading" });
    }
    const steamTon =
      body.steamInitial != null && body.steamFinal != null
        ? Number(body.steamFinal) - Number(body.steamInitial)
        : null;
    const shutdownRequired = steamTon === 0 || body.burnerStatus === "stopped";
    if (shutdownRequired && !body.shutdownReason?.trim()) {
      return res.status(400).json({
        message: "A shutdown reason is required when steam ton is 0 or the burner is stopped",
      });
    }

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantDailyReport.findFirst({
        where: { id: reportId, organizationId },
      });
      if (!existing) return res.status(404).json({ message: "Report not found" });
      if (!canManage(existing, req.user!.id, req.user!.role)) {
        return res
          .status(403)
          .json({ message: "Only the person who created this report (or an admin) can edit it" });
      }

      const staffUserIds = Array.isArray(body.staffUserIds) ? [...new Set(body.staffUserIds)] : [];
      const customValues = await coerceCustomValues(organizationId, body.customValues);
      const itemEntries = await resolveItemEntries(
        organizationId,
        existing.projectId,
        existing.date,
        body.itemEntries,
      );

      const updated = await prisma.$transaction(async (tx) => {
        await tx.plantDailyReport.update({
          where: { id: reportId },
          data: {
            steamInitial: body.steamInitial ?? null,
            steamFinal: body.steamFinal ?? null,
            steamPressure: body.steamPressure ?? null,
            steamTemp: body.steamTemp ?? null,
            feedwaterTemp: body.feedwaterTemp ?? null,
            pelletUsedKg: body.pelletUsedKg ?? null,
            pelletsBag: body.pelletsBag ?? null,
            pelletReceivedKg: body.pelletReceivedKg ?? null,
            waterInitial: body.waterInitial ?? null,
            waterFinal: body.waterFinal ?? null,
            burnerStatus: body.burnerStatus ?? null,
            burnerHours: body.burnerHours ?? null,
            shutdownReason: body.shutdownReason?.trim() || null,
            customValues,
          },
        });
        await tx.plantReportStaff.deleteMany({ where: { reportId } });
        if (staffUserIds.length > 0) {
          await tx.plantReportStaff.createMany({
            data: staffUserIds.map((userId) => ({ reportId, userId })),
          });
        }
        await tx.plantReportItemEntry.deleteMany({ where: { reportId } });
        if (itemEntries.length > 0) {
          await tx.plantReportItemEntry.createMany({
            data: itemEntries.map((e) => ({ ...e, reportId })),
          });
        }
        return tx.plantDailyReport.findUniqueOrThrow({
          where: { id: reportId },
          include: REPORT_INCLUDE,
        });
      });

      return res.status(200).json({ report: shapeReport(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const reportId = parseInt(id as string, 10);
    if (!Number.isInteger(reportId)) return res.status(400).json({ message: "Invalid report id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantDailyReport.findFirst({
        where: { id: reportId, organizationId },
      });
      if (!existing) return res.status(404).json({ message: "Report not found" });
      if (!canManage(existing, req.user!.id, req.user!.role)) {
        return res
          .status(403)
          .json({ message: "Only the person who created this report (or an admin) can delete it" });
      }

      await prisma.plantDailyReport.delete({ where: { id: reportId } });
      return res.status(200).json({ message: "Report deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
