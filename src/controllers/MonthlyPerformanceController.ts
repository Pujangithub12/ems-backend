import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Project } from "../entities/Project";
import { MonthlyPerformance } from "../entities/MonthlyPerformance";
import { AuthRequest } from "../middlewares/auth";
import { UpsertMonthlyPerformanceDto } from "../dto/monthlyPerformance.dto";

/** Energy Performance tab: one row per (project, year, month) generation/financial report. */
export class MonthlyPerformanceController {
  /** GET /projects/:projectId/performance?year=YYYY — the rows that exist for that year. Open to any workspace member. */
  static getMonthlyPerformance = async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const year = parseInt((req.query.year as string) || `${new Date().getFullYear()}`);

    try {
      const projectRepository = AppDataSource.getRepository(Project);
      const rowRepository = AppDataSource.getRepository(MonthlyPerformance);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const rows = await rowRepository.find({
        where: { project: { id: project.id }, year },
        order: { month: "ASC" },
      });

      return res.status(200).json({ rows, year });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
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
      const projectRepository = AppDataSource.getRepository(Project);
      const rowRepository = AppDataSource.getRepository(MonthlyPerformance);

      const project = await projectRepository.findOne({
        where: {
          id: parseInt(projectId as string),
          workspace: { id: req.workspace!.id },
        },
      });
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      let row = await rowRepository.findOne({
        where: { project: { id: project.id }, year, month },
      });

      if (!row) {
        row = rowRepository.create({ year, month, project, workspace: req.workspace! });
      }

      // null (not undefined) so TypeORM actually issues SET col = NULL instead
      // of silently excluding the column from the UPDATE when clearing a value.
      if (contractEnergy !== undefined) {
        row.contractEnergy = contractEnergy === null ? (null as unknown as number) : contractEnergy;
      }
      if (actualGeneration !== undefined) {
        row.actualGeneration =
          actualGeneration === null ? (null as unknown as number) : actualGeneration;
      }
      if (incomeReceived !== undefined) {
        row.incomeReceived = incomeReceived === null ? (null as unknown as number) : incomeReceived;
      }
      if (monthlyExpenditure !== undefined) {
        row.monthlyExpenditure =
          monthlyExpenditure === null ? (null as unknown as number) : monthlyExpenditure;
      }
      if (sparePartPurchase !== undefined) {
        row.sparePartPurchase =
          sparePartPurchase === null ? (null as unknown as number) : sparePartPurchase;
      }

      await rowRepository.save(row);
      return res.status(200).json({ message: "Monthly performance saved", row });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
