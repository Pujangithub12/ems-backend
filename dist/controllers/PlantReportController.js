"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlantReportController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
/** Parses a "YYYY-MM-DD" date string as a UTC midnight Date — matches how
 * the `date` column (Postgres `date`, no time component) round-trips
 * through Prisma, and avoids the local-timezone-shift bug plain
 * `new Date("YYYY-MM-DD")` doesn't have but `new Date(y, m, d)` would. */
const parseDateOnly = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const d = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};
const REPORT_INCLUDE = {
    createdBy: { select: { id: true, fullName: true } },
    project: { select: { id: true, name: true } },
    staff: { include: { user: { select: { id: true, fullName: true } } } },
};
/** Flattens the raw join-row shape into a plain response object. All plant
 * metrics live in customValues now — there are no fixed reading columns or
 * derived figures left to compute here. */
const shapeReport = (report) => {
    return {
        id: report.id,
        date: report.date.toISOString().slice(0, 10),
        customValues: report.customValues ?? {},
        staff: Array.isArray(report.staff) ? report.staff.map((s) => s.user) : [],
        staffCount: Array.isArray(report.staff) ? report.staff.length : 0,
        project: report.project,
        createdBy: report.createdBy,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
    };
};
/** Parses+validates a projectId that must belong to this organization —
 * returns null for an absent/empty value (meaning "no project" / "all
 * projects", depending on call site), or throws a 400-worthy Error for a
 * value that doesn't parse or isn't one of this organization's projects. */
async function resolveProjectId(organizationId, raw) {
    if (raw === undefined || raw === null || raw === "")
        return null;
    const projectId = Number(raw);
    if (!Number.isInteger(projectId))
        throw new Error("Invalid project id");
    const project = await prisma_1.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project)
        throw new Error("Project not found in this organization");
    return projectId;
}
/** Coerces one raw custom-field value to match its field's declared
 * dataType — an empty/unparseable value becomes null rather than rejecting
 * the whole save, since these are optional extra columns, not required
 * plant readings. */
function coerceCustomValue(value, dataType) {
    if (value === null || value === undefined || value === "")
        return null;
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
async function coerceCustomValues(organizationId, raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const fields = await prisma_1.prisma.plantReportCustomField.findMany({ where: { organizationId } });
    const result = {};
    for (const field of fields) {
        const key = String(field.id);
        if (!(key in raw))
            continue;
        result[key] = coerceCustomValue(raw[key], field.dataType);
    }
    return result;
}
/** Whether `actor` may edit/delete a report they didn't create themselves. */
const canManage = (report, actorId, actorRole) => report.createdById === actorId ||
    actorRole === enums_1.UserRole.ADMIN ||
    actorRole === enums_1.UserRole.SUPER_ADMIN;
class PlantReportController {
    /** GET /plant-reports?year=&month= — every entry for that calendar month,
     * plus a totals/averages summary for the report/table view. Defaults to
     * the current year/month if not given. */
    static getMonth = async (req, res) => {
        try {
            const organizationId = req.organization.id;
            const now = new Date();
            const year = parseInt(req.query.year || String(now.getUTCFullYear()), 10);
            const month = parseInt(req.query.month || String(now.getUTCMonth() + 1), 10);
            if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
                return res.status(400).json({ message: "Invalid year or month" });
            }
            const rangeStart = new Date(Date.UTC(year, month - 1, 1));
            const rangeEnd = new Date(Date.UTC(year, month, 1));
            // Omitted entirely = every project for this organization (a combined
            // total across all plants); given = just that one project's entries.
            let projectId = null;
            try {
                projectId = await resolveProjectId(organizationId, req.query.projectId);
            }
            catch (err) {
                return res.status(400).json({ message: err.message });
            }
            const reports = await prisma_1.prisma.plantDailyReport.findMany({
                where: {
                    organizationId,
                    date: { gte: rangeStart, lt: rangeEnd },
                    ...(req.query.projectId ? { projectId } : {}),
                },
                include: REPORT_INCLUDE,
                orderBy: [{ date: "asc" }, { projectId: "asc" }],
            });
            const shaped = reports.map(shapeReport);
            const sum = (vals) => vals.reduce((acc, v) => (v == null ? acc : (acc ?? 0) + v), null);
            const avg = (vals) => {
                const present = vals.filter((v) => v != null);
                return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
            };
            // Per-numeric-custom-field totals across the month — org-defined
            // fields are the only source of plant metrics now, so this is the
            // whole summary beyond daysLogged.
            const numberFields = await prisma_1.prisma.plantReportCustomField.findMany({
                where: { organizationId, dataType: "number" },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            });
            const customFieldTotals = numberFields.map((field) => {
                const key = String(field.id);
                const values = shaped
                    .map((r) => r.customValues[key])
                    .map((v) => (typeof v === "number" ? v : null));
                return {
                    fieldId: field.id,
                    name: field.name,
                    sum: sum(values),
                    avg: avg(values),
                };
            });
            const summary = {
                customFieldTotals,
                daysLogged: shaped.length,
            };
            return res.status(200).json({ reports: shaped, summary, year, month });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /plant-reports/prefill?date=YYYY-MM-DD&projectId= — whether an
     * entry for this project+date already exists, so the form can switch to
     * edit mode. */
    static getPrefill = async (req, res) => {
        try {
            const organizationId = req.organization.id;
            const date = parseDateOnly(req.query.date || "");
            if (!date)
                return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });
            let projectId;
            try {
                projectId = await resolveProjectId(organizationId, req.query.projectId);
            }
            catch (err) {
                return res.status(400).json({ message: err.message });
            }
            const existing = await prisma_1.prisma.plantDailyReport.findFirst({
                where: { organizationId, projectId, date },
                include: REPORT_INCLUDE,
            });
            if (existing) {
                return res.status(200).json({ exists: true, report: shapeReport(existing) });
            }
            return res.status(200).json({ exists: false });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static create = async (req, res) => {
        const body = req.body;
        const date = parseDateOnly(body.date || "");
        if (!date)
            return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });
        try {
            const organizationId = req.organization.id;
            let projectId;
            try {
                projectId = await resolveProjectId(organizationId, body.projectId);
            }
            catch (err) {
                return res.status(400).json({ message: err.message });
            }
            const staffUserIds = Array.isArray(body.staffUserIds) ? [...new Set(body.staffUserIds)] : [];
            const customValues = await coerceCustomValues(organizationId, body.customValues);
            const created = await prisma_1.prisma.$transaction(async (tx) => {
                const report = await tx.plantDailyReport.create({
                    data: {
                        organizationId,
                        projectId,
                        date,
                        customValues,
                        createdById: req.user.id,
                    },
                });
                if (staffUserIds.length > 0) {
                    await tx.plantReportStaff.createMany({
                        data: staffUserIds.map((userId) => ({ reportId: report.id, userId })),
                    });
                }
                return tx.plantDailyReport.findUniqueOrThrow({
                    where: { id: report.id },
                    include: REPORT_INCLUDE,
                });
            });
            return res.status(201).json({ report: shapeReport(created) });
        }
        catch (error) {
            if (error?.code === "P2002") {
                return res.status(409).json({ message: "A report for this date already exists" });
            }
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static update = async (req, res) => {
        const { id } = req.params;
        const body = req.body;
        const reportId = parseInt(id, 10);
        if (!Number.isInteger(reportId))
            return res.status(400).json({ message: "Invalid report id" });
        try {
            const organizationId = req.organization.id;
            const existing = await prisma_1.prisma.plantDailyReport.findFirst({
                where: { id: reportId, organizationId },
            });
            if (!existing)
                return res.status(404).json({ message: "Report not found" });
            if (!canManage(existing, req.user.id, req.user.role)) {
                return res
                    .status(403)
                    .json({ message: "Only the person who created this report (or an admin) can edit it" });
            }
            const staffUserIds = Array.isArray(body.staffUserIds) ? [...new Set(body.staffUserIds)] : [];
            const customValues = await coerceCustomValues(organizationId, body.customValues);
            const updated = await prisma_1.prisma.$transaction(async (tx) => {
                await tx.plantDailyReport.update({
                    where: { id: reportId },
                    data: { customValues },
                });
                await tx.plantReportStaff.deleteMany({ where: { reportId } });
                if (staffUserIds.length > 0) {
                    await tx.plantReportStaff.createMany({
                        data: staffUserIds.map((userId) => ({ reportId, userId })),
                    });
                }
                return tx.plantDailyReport.findUniqueOrThrow({
                    where: { id: reportId },
                    include: REPORT_INCLUDE,
                });
            });
            return res.status(200).json({ report: shapeReport(updated) });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static remove = async (req, res) => {
        const { id } = req.params;
        const reportId = parseInt(id, 10);
        if (!Number.isInteger(reportId))
            return res.status(400).json({ message: "Invalid report id" });
        try {
            const organizationId = req.organization.id;
            const existing = await prisma_1.prisma.plantDailyReport.findFirst({
                where: { id: reportId, organizationId },
            });
            if (!existing)
                return res.status(404).json({ message: "Report not found" });
            if (!canManage(existing, req.user.id, req.user.role)) {
                return res
                    .status(403)
                    .json({ message: "Only the person who created this report (or an admin) can delete it" });
            }
            await prisma_1.prisma.plantDailyReport.delete({ where: { id: reportId } });
            return res.status(200).json({ message: "Report deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.PlantReportController = PlantReportController;
//# sourceMappingURL=PlantReportController.js.map