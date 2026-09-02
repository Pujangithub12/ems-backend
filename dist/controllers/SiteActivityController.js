"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteActivityController = void 0;
const prisma_1 = require("../config/prisma");
const siteActivity_dto_1 = require("../dto/siteActivity.dto");
const toDateOnly = (value) => {
    const s = String(value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        return null;
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};
const shapeReport = (report) => ({
    id: report.id,
    projectId: report.projectId,
    reportDate: report.reportDate.toISOString().slice(0, 10),
    location: report.location,
    reportDateBs: report.reportDateBs,
    preparedBy: report.preparedBy,
    remarks: report.remarks,
    signedBy: report.signedBy,
    status: report.status,
    createdBy: report.createdBy ? { id: report.createdBy.id, name: report.createdBy.fullName } : null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    activities: report.activities
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((a) => ({
        id: a.id,
        description: a.description,
        chainage: a.chainage,
        todayQty: a.todayQty,
        unit: a.unit,
        status: a.status,
        remarks: a.remarks,
        photos: a.photos.map((p) => ({ id: p.id, filePath: p.filePath, fileName: p.fileName, caption: p.caption })),
    })),
    equipment: report.equipment
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((e) => ({ id: e.id, equipmentName: e.equipmentName, quantity: e.quantity, workingHours: e.workingHours, condition: e.condition, remarks: e.remarks })),
    manpower: report.manpower
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({ id: m.id, role: m.role, headcount: m.headcount, names: m.names, remarks: m.remarks })),
    photos: report.photos.map((p) => ({
        id: p.id,
        itemId: p.itemId,
        filePath: p.filePath,
        fileName: p.fileName,
        caption: p.caption,
        uploadedAt: p.uploadedAt,
    })),
    weather: report.weather.map((w) => ({ id: w.id, slot: w.slot, condition: w.condition, tempC: w.tempC, rainfall: w.rainfall, remarks: w.remarks })),
    materials: report.materials
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({
        id: m.id,
        materialType: m.materialType,
        receivedQuantity: m.receivedQuantity,
        receivedUnit: m.receivedUnit,
        usedQuantity: m.usedQuantity,
        usedUnit: m.usedUnit,
        remarks: m.remarks,
    })),
    safety: report.safety
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ id: s.id, type: s.type, description: s.description, actionTaken: s.actionTaken })),
    instructions: report.instructions
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({ id: i.id, description: i.description, byWhom: i.byWhom, toWhom: i.toWhom, time: i.time, signatureOf: i.signatureOf })),
});
const REPORT_INCLUDE = {
    createdBy: { select: { id: true, fullName: true } },
    activities: { include: { photos: true } },
    equipment: true,
    manpower: true,
    photos: true,
    weather: true,
    materials: true,
    safety: true,
    instructions: true,
};
/** Manages the "Site Activities" page's per-day site reports (the sidebar
 * link that replaced Plant Report's old "Work Activities" tab) — a fixed
 * daily-log shape (work activities, equipment, manpower, photos) matching
 * the paper DPR form, one report per (project, date). */
class SiteActivityController {
    /** GET /site-activity-work-types — the org's reusable "Work description"
     * vocabulary for the Work Activities table's predefined-options dropdown,
     * alphabetical. Grows automatically as new descriptions are saved (see
     * `save()` below) — no separate admin CRUD needed. */
    static listWorkTypes = async (req, res) => {
        try {
            const workTypes = await prisma_1.prisma.siteActivityWorkType.findMany({
                where: { organizationId: req.organization.id },
                orderBy: { name: "asc" },
                select: { name: true },
            });
            return res.status(200).json({ workTypes: workTypes.map((w) => w.name) });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /site-activity-reports?projectId&date — the one report for that
     * project+date, or `{ report: null }` if none has been filled in yet (the
     * frontend shows a "New DPR" prompt in that case rather than a 404). */
    static getByDate = async (req, res) => {
        const projectId = parseInt(req.query.projectId, 10);
        const reportDate = toDateOnly(req.query.date);
        if (!Number.isInteger(projectId))
            return res.status(400).json({ message: "projectId is required" });
        if (!reportDate)
            return res.status(400).json({ message: "date must be YYYY-MM-DD" });
        try {
            const organizationId = req.organization.id;
            const project = await prisma_1.prisma.project.findFirst({ where: { id: projectId, organizationId } });
            if (!project)
                return res.status(404).json({ message: "Project not found in this organization" });
            const report = await prisma_1.prisma.siteActivityReport.findFirst({
                where: { organizationId, projectId, reportDate },
                include: REPORT_INCLUDE,
            });
            return res.status(200).json({ report: report ? shapeReport(report) : null });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /site-activity-reports/range?projectId&from&to — every report in an
     * inclusive date range, ordered oldest-first; backs the Weekly Summary
     * view (a week is just a 7-day range) without hammering the single-date
     * endpoint 7 times. Missing days simply have no entry in the array — the
     * frontend fills the gaps in when it builds the day-by-day rollup. */
    static getRange = async (req, res) => {
        const projectId = parseInt(req.query.projectId, 10);
        const from = toDateOnly(req.query.from);
        const to = toDateOnly(req.query.to);
        if (!Number.isInteger(projectId))
            return res.status(400).json({ message: "projectId is required" });
        if (!from || !to)
            return res.status(400).json({ message: "from and to must be YYYY-MM-DD" });
        if (from > to)
            return res.status(400).json({ message: "from must not be after to" });
        try {
            const organizationId = req.organization.id;
            const project = await prisma_1.prisma.project.findFirst({ where: { id: projectId, organizationId } });
            if (!project)
                return res.status(404).json({ message: "Project not found in this organization" });
            const reports = await prisma_1.prisma.siteActivityReport.findMany({
                where: { organizationId, projectId, reportDate: { gte: from, lte: to } },
                include: REPORT_INCLUDE,
                orderBy: { reportDate: "asc" },
            });
            return res.status(200).json({ reports: reports.map(shapeReport) });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /site-activity-reports?projectId — creates the report for that
     * date if none exists yet ("New DPR"), or full-replaces every child
     * section (delete-all-then-reinsert) if one already does — same
     * full-replace convention this codebase already uses for
     * Schedule/PlantReport staff, appropriate here since every section is
     * wholly owned by this report alone. */
    static save = async (req, res) => {
        const projectId = parseInt(req.query.projectId, 10);
        if (!Number.isInteger(projectId))
            return res.status(400).json({ message: "projectId is required" });
        const body = req.body;
        const reportDate = toDateOnly(body.reportDate);
        if (!reportDate)
            return res.status(400).json({ message: "reportDate must be YYYY-MM-DD" });
        const status = body.status && siteActivity_dto_1.VALID_REPORT_STATUS.has(body.status) ? body.status : "submitted";
        const location = (body.location || "").trim() || null;
        const reportDateBs = (body.reportDateBs || "").trim() || null;
        const preparedBy = (body.preparedBy || "").trim() || null;
        const remarks = (body.remarks || "").trim() || null;
        const signedBy = (body.signedBy || "").trim() || null;
        const activities = (Array.isArray(body.activities) ? body.activities : [])
            .map((a) => ({
            description: (a.description || "").trim(),
            chainage: (a.chainage || "").trim() || null,
            todayQty: a.todayQty != null && Number.isFinite(Number(a.todayQty)) ? Number(a.todayQty) : null,
            unit: (a.unit || "").trim() || null,
            status: a.status && siteActivity_dto_1.VALID_ITEM_STATUS.has(a.status) ? a.status : "ongoing",
            remarks: (a.remarks || "").trim() || null,
        }))
            .filter((a) => a.description);
        const equipment = (Array.isArray(body.equipment) ? body.equipment : [])
            .map((e) => ({
            equipmentName: (e.equipmentName || "").trim(),
            quantity: e.quantity != null && Number.isFinite(Number(e.quantity)) ? Math.max(0, Math.trunc(Number(e.quantity))) : 1,
            workingHours: e.workingHours != null && Number.isFinite(Number(e.workingHours)) ? Number(e.workingHours) : null,
            condition: e.condition && siteActivity_dto_1.VALID_EQUIPMENT_CONDITION.has(e.condition) ? e.condition : "working",
            remarks: (e.remarks || "").trim() || null,
        }))
            .filter((e) => e.equipmentName);
        const manpower = (Array.isArray(body.manpower) ? body.manpower : [])
            .map((m) => ({
            role: (m.role || "").trim(),
            headcount: m.headcount != null && Number.isFinite(Number(m.headcount)) ? Math.max(0, Math.trunc(Number(m.headcount))) : 0,
            names: (m.names || "").trim() || null,
            remarks: (m.remarks || "").trim() || null,
        }))
            .filter((m) => m.role);
        const weather = (Array.isArray(body.weather) ? body.weather : [])
            .filter((w) => w.slot && siteActivity_dto_1.VALID_WEATHER_SLOT.has(w.slot))
            .map((w) => ({
            slot: w.slot,
            condition: (w.condition || "").trim() || null,
            tempC: w.tempC != null && Number.isFinite(Number(w.tempC)) ? Number(w.tempC) : null,
            rainfall: w.rainfall && siteActivity_dto_1.VALID_RAINFALL.has(w.rainfall) ? w.rainfall : null,
            remarks: (w.remarks || "").trim() || null,
        }));
        const materials = (Array.isArray(body.materials) ? body.materials : [])
            .map((m) => ({
            materialType: (m.materialType || "").trim(),
            receivedQuantity: m.receivedQuantity != null && Number.isFinite(Number(m.receivedQuantity)) ? Number(m.receivedQuantity) : null,
            receivedUnit: (m.receivedUnit || "").trim() || null,
            usedQuantity: m.usedQuantity != null && Number.isFinite(Number(m.usedQuantity)) ? Number(m.usedQuantity) : null,
            usedUnit: (m.usedUnit || "").trim() || null,
            remarks: (m.remarks || "").trim() || null,
        }))
            .filter((m) => m.materialType);
        const safety = (Array.isArray(body.safety) ? body.safety : [])
            .map((s) => ({
            type: s.type && siteActivity_dto_1.VALID_SAFETY_TYPE.has(s.type) ? s.type : "observation",
            description: (s.description || "").trim() || null,
            actionTaken: (s.actionTaken || "").trim() || null,
        }))
            .filter((s) => s.description);
        const instructions = (Array.isArray(body.instructions) ? body.instructions : [])
            .map((i) => ({
            description: (i.description || "").trim() || null,
            byWhom: (i.byWhom || "").trim() || null,
            toWhom: (i.toWhom || "").trim() || null,
            time: (i.time || "").trim() || null,
            signatureOf: (i.signatureOf || "").trim() || null,
        }))
            .filter((i) => i.description);
        try {
            const organizationId = req.organization.id;
            const project = await prisma_1.prisma.project.findFirst({ where: { id: projectId, organizationId } });
            if (!project)
                return res.status(404).json({ message: "Project not found in this organization" });
            const existing = await prisma_1.prisma.siteActivityReport.findFirst({ where: { organizationId, projectId, reportDate } });
            const reportId = await prisma_1.prisma.$transaction(async (tx) => {
                let id;
                if (existing) {
                    id = existing.id;
                    await tx.siteActivityReport.update({ where: { id }, data: { location, status, reportDateBs, preparedBy, remarks, signedBy } });
                    await tx.siteActivityItem.deleteMany({ where: { reportId: id } });
                    await tx.siteActivityEquipment.deleteMany({ where: { reportId: id } });
                    await tx.siteActivityManpower.deleteMany({ where: { reportId: id } });
                    await tx.siteActivityWeather.deleteMany({ where: { reportId: id } });
                    await tx.siteActivityMaterial.deleteMany({ where: { reportId: id } });
                    await tx.siteActivitySafety.deleteMany({ where: { reportId: id } });
                    await tx.siteActivityInstruction.deleteMany({ where: { reportId: id } });
                }
                else {
                    const created = await tx.siteActivityReport.create({
                        data: { organizationId, projectId, reportDate, location, status, reportDateBs, preparedBy, remarks, signedBy, createdById: req.user.id },
                    });
                    id = created.id;
                }
                for (const [i, item] of activities.entries()) {
                    await tx.siteActivityItem.create({ data: { reportId: id, sortOrder: i, ...item } });
                }
                for (const [i, item] of equipment.entries()) {
                    await tx.siteActivityEquipment.create({ data: { reportId: id, sortOrder: i, ...item } });
                }
                for (const [i, item] of manpower.entries()) {
                    await tx.siteActivityManpower.create({ data: { reportId: id, sortOrder: i, ...item } });
                }
                for (const item of weather) {
                    await tx.siteActivityWeather.create({ data: { reportId: id, ...item } });
                }
                for (const [i, item] of materials.entries()) {
                    await tx.siteActivityMaterial.create({ data: { reportId: id, sortOrder: i, ...item } });
                }
                for (const [i, item] of safety.entries()) {
                    await tx.siteActivitySafety.create({ data: { reportId: id, sortOrder: i, ...item } });
                }
                for (const [i, item] of instructions.entries()) {
                    await tx.siteActivityInstruction.create({ data: { reportId: id, sortOrder: i, ...item } });
                }
                return id;
            });
            // Grow the org's "Work description" vocabulary with any new descriptions typed in —
            // best-effort, outside the main transaction (a duplicate/failure here shouldn't fail the save).
            const descriptions = Array.from(new Set(activities.map((a) => a.description).filter(Boolean)));
            if (descriptions.length > 0) {
                try {
                    await prisma_1.prisma.siteActivityWorkType.createMany({
                        data: descriptions.map((name) => ({ organizationId, name })),
                        skipDuplicates: true,
                    });
                }
                catch (error) {
                    console.error("Failed to record new site activity work types:", error);
                }
            }
            const report = await prisma_1.prisma.siteActivityReport.findUniqueOrThrow({ where: { id: reportId }, include: REPORT_INCLUDE });
            return res.status(existing ? 200 : 201).json({ report: shapeReport(report) });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /site-activity-reports/:id (admin-only) — cascades to its children/photos. */
    static remove = async (req, res) => {
        const { id } = req.params;
        const reportId = parseInt(id, 10);
        if (!Number.isInteger(reportId))
            return res.status(400).json({ message: "Invalid report id" });
        try {
            const organizationId = req.organization.id;
            const existing = await prisma_1.prisma.siteActivityReport.findFirst({ where: { id: reportId, organizationId } });
            if (!existing)
                return res.status(404).json({ message: "Report not found" });
            await prisma_1.prisma.siteActivityReport.delete({ where: { id: reportId } });
            return res.status(200).json({ message: "Report deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /site-activity-reports/:reportId/photos — attach an uploaded
     * photo (any org member); the actual file is already persisted to
     * storage by uploadSiteActivityPhoto before this runs (req.file.path). */
    static uploadPhoto = async (req, res) => {
        const { reportId } = req.params;
        const id = parseInt(reportId, 10);
        if (!Number.isInteger(id))
            return res.status(400).json({ message: "Invalid report id" });
        if (!req.file)
            return res.status(400).json({ message: "file is required" });
        const itemIdRaw = req.body.itemId;
        const itemId = itemIdRaw != null && itemIdRaw !== "" && Number.isInteger(Number(itemIdRaw)) ? Number(itemIdRaw) : null;
        const caption = (req.body.caption || "").trim() || null;
        try {
            const organizationId = req.organization.id;
            const report = await prisma_1.prisma.siteActivityReport.findFirst({ where: { id, organizationId } });
            if (!report)
                return res.status(404).json({ message: "Report not found" });
            if (itemId != null) {
                const item = await prisma_1.prisma.siteActivityItem.findFirst({ where: { id: itemId, reportId: id } });
                if (!item)
                    return res.status(400).json({ message: "Invalid itemId for this report" });
            }
            const filePath = req.file.path.replace(/\\/g, "/").replace(/^uploads\//, "");
            const photo = await prisma_1.prisma.siteActivityPhoto.create({
                data: { reportId: id, itemId, filePath, fileName: req.file.originalname, caption },
            });
            return res.status(201).json({ photo: { id: photo.id, itemId: photo.itemId, filePath: photo.filePath, fileName: photo.fileName, caption: photo.caption, uploadedAt: photo.uploadedAt } });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /site-activity-photos/:id (any org member). */
    static removePhoto = async (req, res) => {
        const { id } = req.params;
        const photoId = parseInt(id, 10);
        if (!Number.isInteger(photoId))
            return res.status(400).json({ message: "Invalid photo id" });
        try {
            const organizationId = req.organization.id;
            const existing = await prisma_1.prisma.siteActivityPhoto.findFirst({ where: { id: photoId, report: { organizationId } } });
            if (!existing)
                return res.status(404).json({ message: "Photo not found" });
            await prisma_1.prisma.siteActivityPhoto.delete({ where: { id: photoId } });
            return res.status(200).json({ message: "Photo deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.SiteActivityController = SiteActivityController;
//# sourceMappingURL=SiteActivityController.js.map