"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyGenerationController = void 0;
const prisma_1 = require("../config/prisma");
/** Postgres `numeric` (Decimal) columns come back as Prisma's Decimal wrapper, not a plain number — coerce for arithmetic. */
const toNum = (value) => value == null ? null : value.toNumber();
const shapeRow = (row) => {
    const checkMeterInitial = toNum(row.checkMeterInitial);
    const checkMeterFinal = toNum(row.checkMeterFinal);
    const mainMeterInitial = toNum(row.mainMeterInitial);
    const mainMeterFinal = toNum(row.mainMeterFinal);
    return {
        date: row.date.toISOString().slice(0, 10),
        generation: toNum(row.generation),
        checkMeterInitial,
        checkMeterFinal,
        checkMeterDifference: checkMeterInitial !== null && checkMeterFinal !== null ? checkMeterFinal - checkMeterInitial : null,
        mainMeterInitial,
        mainMeterFinal,
        mainMeterDifference: mainMeterInitial !== null && mainMeterFinal !== null ? mainMeterFinal - mainMeterInitial : null,
    };
};
const parseDateParam = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const d = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};
/** Energy Performance tab: per-day meter readings (Check Meter + Main Meter),
 * BS-calendar-agnostic on the backend — callers pass explicit AD date ranges,
 * computed client-side from the selected Bikram Sambat month/year. */
class DailyGenerationController {
    /** GET /projects/:projectId/performance/daily?startDate=&endDate= — rows in
     * that AD date range (inclusive start, exclusive end). Open to any organization member. */
    static getDaily = async (req, res) => {
        const { projectId } = req.params;
        const startDate = parseDateParam(req.query.startDate);
        const endDate = parseDateParam(req.query.endDate);
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "Valid startDate and endDate (YYYY-MM-DD) are required" });
        }
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: { id: parseInt(projectId), organizationId: req.organization.id },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const rows = await prisma_1.prisma.dailyGeneration.findMany({
                where: { projectId: project.id, date: { gte: startDate, lt: endDate } },
                orderBy: { date: "asc" },
            });
            return res.status(200).json({ days: rows.map(shapeRow) });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** PUT /projects/:projectId/performance/daily — upserts (find-or-create) the row for one day. Admin-gated (see routes.ts). */
    static upsertDaily = async (req, res) => {
        const { projectId } = req.params;
        const { date, checkMeterInitial, checkMeterFinal, mainMeterInitial, mainMeterFinal } = req.body;
        const parsedDate = parseDateParam(date);
        if (!parsedDate) {
            return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });
        }
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: { id: parseInt(projectId), organizationId: req.organization.id },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            // "Actual Generation" throughout the app (chart, financial table, yearly
            // totals) is derived from the Main Meter reading — Check Meter is kept
            // only as a secondary displayed figure, not summed anywhere.
            const generation = mainMeterInitial != null && mainMeterFinal != null ? mainMeterFinal - mainMeterInitial : null;
            const existing = await prisma_1.prisma.dailyGeneration.findFirst({
                where: { projectId: project.id, date: parsedDate },
            });
            const data = {
                generation,
                checkMeterInitial: checkMeterInitial ?? null,
                checkMeterFinal: checkMeterFinal ?? null,
                mainMeterInitial: mainMeterInitial ?? null,
                mainMeterFinal: mainMeterFinal ?? null,
            };
            let row;
            if (existing) {
                row = await prisma_1.prisma.dailyGeneration.update({ where: { id: existing.id }, data });
            }
            else {
                row = await prisma_1.prisma.dailyGeneration.create({
                    data: { date: parsedDate, projectId: project.id, organizationId: req.organization.id, ...data },
                });
            }
            return res.status(200).json({ message: "Daily generation saved", row: shapeRow(row) });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/:projectId/performance/summary — sums DailyGeneration.generation
     * over each caller-supplied date-range bucket. No calendar awareness: the caller
     * (frontend) computes each bucket's AD start/end and an opaque `key` to echo back
     * (e.g. a BS month number), and pairs the result with contractEnergy itself. */
    static getSummary = async (req, res) => {
        const { projectId } = req.params;
        const buckets = Array.isArray(req.body?.buckets) ? req.body.buckets : [];
        if (buckets.length === 0) {
            return res.status(400).json({ message: "At least one bucket is required" });
        }
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: { id: parseInt(projectId), organizationId: req.organization.id },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const results = [];
            for (const bucket of buckets) {
                const startDate = parseDateParam(bucket.startDate);
                const endDate = parseDateParam(bucket.endDate);
                if (!startDate || !endDate || typeof bucket.key !== "number") {
                    return res.status(400).json({ message: "Each bucket needs a numeric key and valid startDate/endDate" });
                }
                const rows = await prisma_1.prisma.dailyGeneration.findMany({
                    where: { projectId: project.id, date: { gte: startDate, lt: endDate } },
                    select: { generation: true },
                });
                const sum = rows.reduce((acc, r) => acc + (toNum(r.generation) ?? 0), 0);
                const hasAny = rows.some((r) => r.generation !== null);
                results.push({ key: bucket.key, generation: hasAny ? sum : null });
            }
            return res.status(200).json({ rows: results });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /projects/:projectId/performance/daily — deletes one or more days
     * at once (single-row delete just sends a one-element `dates` array).
     * Admin-gated (see routes.ts). */
    static deleteDaily = async (req, res) => {
        const { projectId } = req.params;
        const { dates } = req.body;
        if (!Array.isArray(dates) || dates.length === 0) {
            return res.status(400).json({ message: "At least one date is required" });
        }
        const parsedDates = dates.map(parseDateParam);
        if (parsedDates.some((d) => d === null)) {
            return res.status(400).json({ message: "Every date must be a valid YYYY-MM-DD" });
        }
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: { id: parseInt(projectId), organizationId: req.organization.id },
            });
            if (!project) {
                return res.status(404).json({ message: "Project not found" });
            }
            const result = await prisma_1.prisma.dailyGeneration.deleteMany({
                where: { projectId: project.id, date: { in: parsedDates } },
            });
            return res.status(200).json({ message: "Daily generation entries deleted", count: result.count });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.DailyGenerationController = DailyGenerationController;
//# sourceMappingURL=DailyGenerationController.js.map