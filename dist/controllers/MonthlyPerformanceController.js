"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonthlyPerformanceController = void 0;
const prisma_1 = require("../config/prisma");
/** Energy Performance tab: one row per (project, year, month) generation/financial report. */
class MonthlyPerformanceController {
    /** GET /projects/:projectId/performance?year=YYYY — the rows that exist for that year. Open to any organization member. */
    static getMonthlyPerformance = async (req, res) => {
        const { projectId } = req.params;
        const year = parseInt(req.query.year || `${new Date().getFullYear()}`);
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const rows = await prisma_1.prisma.monthlyPerformance.findMany({
                where: { projectId: project.id, year },
                orderBy: { month: "asc" },
            });
            return res.status(200).json({ rows, year });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    /** PUT /projects/:projectId/performance — upserts (find-or-create) the row for one month. Admin-gated (see routes.ts). */
    static upsertMonthlyPerformance = async (req, res) => {
        const { projectId } = req.params;
        const { year, month, contractEnergy, actualGeneration, incomeReceived, monthlyExpenditure, sparePartPurchase, } = req.body;
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ message: "A valid year and month (1-12) are required" });
        }
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: {
                    id: parseInt(projectId),
                    organizationId: req.organization.id,
                },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const existing = await prisma_1.prisma.monthlyPerformance.findFirst({
                where: { projectId: project.id, year, month },
            });
            // null (not undefined) so Prisma actually issues SET col = NULL instead
            // of silently excluding the column from the UPDATE when clearing a value.
            const data = {};
            if (contractEnergy !== undefined)
                data.contractEnergy = contractEnergy;
            if (actualGeneration !== undefined)
                data.actualGeneration = actualGeneration;
            if (incomeReceived !== undefined)
                data.incomeReceived = incomeReceived;
            if (monthlyExpenditure !== undefined)
                data.monthlyExpenditure = monthlyExpenditure;
            if (sparePartPurchase !== undefined)
                data.sparePartPurchase = sparePartPurchase;
            let row;
            if (existing) {
                row = await prisma_1.prisma.monthlyPerformance.update({
                    where: { id: existing.id },
                    data,
                });
            }
            else {
                row = await prisma_1.prisma.monthlyPerformance.create({
                    data: {
                        year,
                        month,
                        projectId: project.id,
                        organizationId: req.organization.id,
                        ...data,
                    },
                });
            }
            return res.status(200).json({ message: "Monthly performance saved", row });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.MonthlyPerformanceController = MonthlyPerformanceController;
//# sourceMappingURL=MonthlyPerformanceController.js.map