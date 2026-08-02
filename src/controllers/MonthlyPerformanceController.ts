import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UpsertMonthlyPerformanceDto } from "../dto/monthlyPerformance.dto";

/** Energy Performance tab: one row per (project, year, month) generation/financial report. */
export class MonthlyPerformanceController {
  /** GET /projects/:projectId/performance?year=YYYY — the rows that exist for that year. Open to any organization member. */
  static getMonthlyPerformance = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`);

    try {
      const project = await prisma.project.findFirst({
        where: {
          id: parseInt(projectId as string),
          organizationId: req.organization!.id,
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const rows = await prisma.monthlyPerformance.findMany({
        where: { projectId: project.id, year },
        orderBy: { month: "asc" },
      });

      return res.status(200).json({ rows, year });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /projects/:projectId/performance — upserts (find-or-create) the row for one month. Admin-gated (see routes.ts). */
  static upsertMonthlyPerformance = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const {
      year,
      month,
      contractEnergy,
      actualGeneration,
      incomeReceived,
      monthlyExpenditure,
      sparePartPurchase,
    }: UpsertMonthlyPerformanceDto = req.body;

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "A valid year and month (1-12) are required" });
    }

    try {
      const project = await prisma.project.findFirst({
        where: {
          id: parseInt(projectId as string),
          organizationId: req.organization!.id,
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const existing = await prisma.monthlyPerformance.findFirst({
        where: { projectId: project.id, year, month },
      });

      // null (not undefined) so Prisma actually issues SET col = NULL instead
      // of silently excluding the column from the UPDATE when clearing a value.
      const data: any = {};
      if (contractEnergy !== undefined) data.contractEnergy = contractEnergy;
      if (actualGeneration !== undefined) data.actualGeneration = actualGeneration;
      if (incomeReceived !== undefined) data.incomeReceived = incomeReceived;
      if (monthlyExpenditure !== undefined) data.monthlyExpenditure = monthlyExpenditure;
      if (sparePartPurchase !== undefined) data.sparePartPurchase = sparePartPurchase;

      let row;
      if (existing) {
        row = await prisma.monthlyPerformance.update({
          where: { id: existing.id },
          data,
        });
      } else {
        row = await prisma.monthlyPerformance.create({
          data: {
            year,
            month,
            projectId: project.id,
            organizationId: req.organization!.id,
            ...data,
          },
        });
      }

      return res.status(200).json({ message: "Monthly performance saved", row });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
