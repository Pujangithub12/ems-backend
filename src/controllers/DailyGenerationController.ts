import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UpsertDailyGenerationDto, MonthlyGenerationSummaryRow } from "../dto/dailyGeneration.dto";

/** Postgres `numeric` (Decimal) columns come back as Prisma's Decimal wrapper, not a plain number — coerce for arithmetic. */
const toNum = (value: { toNumber(): number } | null | undefined): number | null =>
  value == null ? null : value.toNumber();

/** Sums DailyGeneration rows for one project/year, bucketed by month (1-12).
 * Shared by getMonthlyPerformance (to overlay the derived actualGeneration
 * onto the financial-fields table) and getSummary (the trend chart). */
export async function sumGenerationByMonth(
  projectId: number,
  organizationId: number,
  year: number,
): Promise<Map<number, number>> {
  const rows = await prisma.dailyGeneration.findMany({
    where: {
      projectId,
      organizationId,
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    select: { date: true, generation: true },
  });

  const sums = new Map<number, number>();
  for (const row of rows) {
    const month = row.date.getUTCMonth() + 1;
    const value = toNum(row.generation);
    if (value === null) continue;
    sums.set(month, (sums.get(month) ?? 0) + value);
  }
  return sums;
}

/** Energy Performance tab: per-day generation entries that roll up into MonthlyPerformance.actualGeneration. */
export class DailyGenerationController {
  /** GET /projects/:projectId/performance/daily?year=YYYY&month=M — full day-by-day
   * grid for the month, gaps filled with generation: null. Open to any organization member. */
  static getDaily = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`);
    const month = parseInt((req.query.month as string) || `${new Date().getMonth() + 1}`);

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "A valid year and month (1-12) are required" });
    }

    try {
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId: req.organization!.id },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 1));
      const rows = await prisma.dailyGeneration.findMany({
        where: { projectId: project.id, date: { gte: monthStart, lt: monthEnd } },
      });
      const byDay = new Map<number, number | null>();
      rows.forEach((r) => byDay.set(r.date.getUTCDate(), toNum(r.generation)));

      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const date = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
        return { date, generation: byDay.has(day) ? byDay.get(day)! : null };
      });

      return res.status(200).json({ days, year, month });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /projects/:projectId/performance/daily — upserts (find-or-create) the row for one day. Admin-gated (see routes.ts). */
  static upsertDaily = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const { date, generation }: UpsertDailyGenerationDto = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });
    }

    try {
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId: req.organization!.id },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const parsedDate = new Date(`${date}T00:00:00.000Z`);
      const existing = await prisma.dailyGeneration.findFirst({
        where: { projectId: project.id, date: parsedDate },
      });

      let row;
      if (existing) {
        row = await prisma.dailyGeneration.update({
          where: { id: existing.id },
          data: { generation: generation ?? null },
        });
      } else {
        row = await prisma.dailyGeneration.create({
          data: {
            date: parsedDate,
            generation: generation ?? null,
            projectId: project.id,
            organizationId: req.organization!.id,
          },
        });
      }

      return res.status(200).json({
        message: "Daily generation saved",
        row: { date: row.date.toISOString().slice(0, 10), generation: toNum(row.generation) },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /projects/:projectId/performance/summary?year=YYYY — 12 rows of
   * summed daily generation vs. that month's contract target, for the trend chart. */
  static getSummary = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`);

    try {
      const project = await prisma.project.findFirst({
        where: { id: parseInt(projectId as string), organizationId: req.organization!.id },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const [generationSums, performanceRows] = await Promise.all([
        sumGenerationByMonth(project.id, req.organization!.id, year),
        prisma.monthlyPerformance.findMany({ where: { projectId: project.id, year } }),
      ]);
      const contractByMonth = new Map<number, number | null>();
      performanceRows.forEach((r) => contractByMonth.set(r.month, toNum(r.contractEnergy)));

      const rows: MonthlyGenerationSummaryRow[] = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        return {
          month,
          generation: generationSums.get(month) ?? null,
          contractEnergy: contractByMonth.get(month) ?? null,
        };
      });

      return res.status(200).json({ rows, year });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
