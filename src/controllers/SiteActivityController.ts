import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import {
  SaveSiteActivityReportDto,
  VALID_ITEM_STATUS,
  VALID_EQUIPMENT_CONDITION,
  VALID_REPORT_STATUS,
  VALID_WEATHER_SLOT,
  VALID_RAINFALL,
  VALID_SAFETY_TYPE,
} from "../dto/siteActivity.dto";

const toDateOnly = (value: unknown): Date | null => {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const shapeReport = (report: {
  id: number;
  projectId: number;
  reportDate: Date;
  location: string | null;
  reportDateBs: string | null;
  preparedBy: string | null;
  remarks: string | null;
  signedBy: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: number; fullName: string } | null;
  activities: { id: number; sortOrder: number; description: string; chainage: string | null; todayQty: number | null; unit: string | null; status: string; remarks: string | null; photos: { id: number; filePath: string; fileName: string; caption: string | null }[] }[];
  equipment: { id: number; sortOrder: number; equipmentName: string; quantity: number; workingHours: number | null; condition: string; remarks: string | null }[];
  manpower: { id: number; sortOrder: number; role: string; headcount: number; names: string | null; remarks: string | null }[];
  photos: { id: number; itemId: number | null; filePath: string; fileName: string; caption: string | null; uploadedAt: Date }[];
  weather: { id: number; slot: string; condition: string | null; tempC: number | null; rainfall: string | null; remarks: string | null }[];
  materials: { id: number; sortOrder: number; materialType: string; receivedQuantity: number | null; receivedUnit: string | null; usedQuantity: number | null; usedUnit: string | null; remarks: string | null }[];
  safety: { id: number; sortOrder: number; type: string; description: string | null; actionTaken: string | null }[];
  instructions: { id: number; sortOrder: number; description: string | null; byWhom: string | null; toWhom: string | null; time: string | null; signatureOf: string | null }[];
}) => ({
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
const OPTION_KINDS = new Set(["activity", "equipment", "material"]);

export class SiteActivityController {
  /** GET /site-activity-options?kind=activity|equipment|material — the org's
   * reusable predefined-options vocabulary for the Work Activities /
   * Equipment / Materials tables' dropdowns, alphabetical. Grows
   * automatically as new values are saved (see `save()` below) — no
   * separate admin CRUD needed. */
  static listOptions = async (req: AuthRequest, res: Response) => {
    try {
      const kind = typeof req.query.kind === "string" && OPTION_KINDS.has(req.query.kind) ? req.query.kind : "activity";
      const options = await prisma.siteActivityWorkType.findMany({
        where: { organizationId: req.organization!.id, kind },
        orderBy: { name: "asc" },
        select: { name: true },
      });
      return res.status(200).json({ options: options.map((o) => o.name) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /site-activity-options — explicitly add a new option to one of the
   * predefined-options dropdowns (the "+" popup next to a select-only
   * dropdown). Body: `{ kind, name }`. Returns the full updated list for that
   * kind so the frontend can select the new entry immediately. */
  static createOption = async (req: AuthRequest, res: Response) => {
    try {
      const kind = typeof req.body?.kind === "string" && OPTION_KINDS.has(req.body.kind) ? req.body.kind : "activity";
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) {
        return res.status(400).json({ message: "name is required" });
      }
      const organizationId = req.organization!.id;
      await prisma.siteActivityWorkType.upsert({
        where: { organizationId_kind_name: { organizationId, kind, name } },
        update: {},
        create: { organizationId, kind, name },
      });
      const options = await prisma.siteActivityWorkType.findMany({
        where: { organizationId, kind },
        orderBy: { name: "asc" },
        select: { name: true },
      });
      return res.status(201).json({ options: options.map((o) => o.name) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /site-activity-reports?projectId&date — the one report for that
   * project+date, or `{ report: null }` if none has been filled in yet (the
   * frontend shows a "New DPR" prompt in that case rather than a 404). */
  static getByDate = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt(req.query.projectId as string, 10);
    const reportDate = toDateOnly(req.query.date);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    if (!reportDate) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const report = await prisma.siteActivityReport.findFirst({
        where: { organizationId, projectId, reportDate },
        include: REPORT_INCLUDE,
      });
      return res.status(200).json({ report: report ? shapeReport(report) : null });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /site-activity-reports/range?projectId&from&to — every report in an
   * inclusive date range, ordered oldest-first; backs the Weekly Summary
   * view (a week is just a 7-day range) without hammering the single-date
   * endpoint 7 times. Missing days simply have no entry in the array — the
   * frontend fills the gaps in when it builds the day-by-day rollup. */
  static getRange = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt(req.query.projectId as string, 10);
    const from = toDateOnly(req.query.from);
    const to = toDateOnly(req.query.to);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    if (!from || !to) return res.status(400).json({ message: "from and to must be YYYY-MM-DD" });
    if (from > to) return res.status(400).json({ message: "from must not be after to" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const reports = await prisma.siteActivityReport.findMany({
        where: { organizationId, projectId, reportDate: { gte: from, lte: to } },
        include: REPORT_INCLUDE,
        orderBy: { reportDate: "asc" },
      });
      return res.status(200).json({ reports: reports.map(shapeReport) });
    } catch (error) {
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
  static save = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt(req.query.projectId as string, 10);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });

    const body: SaveSiteActivityReportDto = req.body;
    const reportDate = toDateOnly(body.reportDate);
    if (!reportDate) return res.status(400).json({ message: "reportDate must be YYYY-MM-DD" });

    const status = body.status && VALID_REPORT_STATUS.has(body.status) ? body.status : "submitted";
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
        status: a.status && VALID_ITEM_STATUS.has(a.status) ? a.status : "ongoing",
        remarks: (a.remarks || "").trim() || null,
      }))
      .filter((a) => a.description);

    const equipment = (Array.isArray(body.equipment) ? body.equipment : [])
      .map((e) => ({
        equipmentName: (e.equipmentName || "").trim(),
        quantity: e.quantity != null && Number.isFinite(Number(e.quantity)) ? Math.max(0, Math.trunc(Number(e.quantity))) : 1,
        workingHours: e.workingHours != null && Number.isFinite(Number(e.workingHours)) ? Number(e.workingHours) : null,
        condition: e.condition && VALID_EQUIPMENT_CONDITION.has(e.condition) ? e.condition : "working",
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
      .filter((w) => w.slot && VALID_WEATHER_SLOT.has(w.slot))
      .map((w) => ({
        slot: w.slot,
        condition: (w.condition || "").trim() || null,
        tempC: w.tempC != null && Number.isFinite(Number(w.tempC)) ? Number(w.tempC) : null,
        rainfall: w.rainfall && VALID_RAINFALL.has(w.rainfall) ? w.rainfall : null,
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
        type: s.type && VALID_SAFETY_TYPE.has(s.type) ? s.type : "observation",
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
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const existing = await prisma.siteActivityReport.findFirst({ where: { organizationId, projectId, reportDate } });

      const reportId = await prisma.$transaction(async (tx) => {
        let id: number;
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
        } else {
          const created = await tx.siteActivityReport.create({
            data: { organizationId, projectId, reportDate, location, status, reportDateBs, preparedBy, remarks, signedBy, createdById: req.user!.id },
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

      // Grow the org's predefined-options vocabularies (Work description / Equipment /
      // Material type) with any new values typed in — best-effort, outside the main
      // transaction (a duplicate/failure here shouldn't fail the save).
      const newOptions: { organizationId: number; kind: string; name: string }[] = [
        ...Array.from(new Set(activities.map((a) => a.description).filter(Boolean))).map((name) => ({ organizationId, kind: "activity", name })),
        ...Array.from(new Set(equipment.map((e) => e.equipmentName).filter(Boolean))).map((name) => ({ organizationId, kind: "equipment", name })),
        ...Array.from(new Set(materials.map((m) => m.materialType).filter(Boolean))).map((name) => ({ organizationId, kind: "material", name })),
      ];
      if (newOptions.length > 0) {
        try {
          await prisma.siteActivityWorkType.createMany({ data: newOptions, skipDuplicates: true });
        } catch (error) {
          console.error("Failed to record new site activity options:", error);
        }
      }

      const report = await prisma.siteActivityReport.findUniqueOrThrow({ where: { id: reportId }, include: REPORT_INCLUDE });
      return res.status(existing ? 200 : 201).json({ report: shapeReport(report) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /site-activity-reports/:id (admin-only) — cascades to its children/photos. */
  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const reportId = parseInt(id as string, 10);
    if (!Number.isInteger(reportId)) return res.status(400).json({ message: "Invalid report id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.siteActivityReport.findFirst({ where: { id: reportId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Report not found" });

      await prisma.siteActivityReport.delete({ where: { id: reportId } });
      return res.status(200).json({ message: "Report deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /site-activity-reports/:reportId/photos — attach an uploaded
   * photo (any org member); the actual file is already persisted to
   * storage by uploadSiteActivityPhoto before this runs (req.file.path). */
  static uploadPhoto = async (req: AuthRequest, res: Response) => {
    const { reportId } = req.params;
    const id = parseInt(reportId as string, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid report id" });
    if (!req.file) return res.status(400).json({ message: "file is required" });

    const itemIdRaw = req.body.itemId;
    const itemId = itemIdRaw != null && itemIdRaw !== "" && Number.isInteger(Number(itemIdRaw)) ? Number(itemIdRaw) : null;
    const caption = (req.body.caption || "").trim() || null;

    try {
      const organizationId = req.organization!.id;
      const report = await prisma.siteActivityReport.findFirst({ where: { id, organizationId } });
      if (!report) return res.status(404).json({ message: "Report not found" });

      if (itemId != null) {
        const item = await prisma.siteActivityItem.findFirst({ where: { id: itemId, reportId: id } });
        if (!item) return res.status(400).json({ message: "Invalid itemId for this report" });
      }

      const filePath = req.file.path.replace(/\\/g, "/").replace(/^uploads\//, "");
      const photo = await prisma.siteActivityPhoto.create({
        data: { reportId: id, itemId, filePath, fileName: req.file.originalname, caption },
      });
      return res.status(201).json({ photo: { id: photo.id, itemId: photo.itemId, filePath: photo.filePath, fileName: photo.fileName, caption: photo.caption, uploadedAt: photo.uploadedAt } });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /site-activity-photos/:id (any org member). */
  static removePhoto = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const photoId = parseInt(id as string, 10);
    if (!Number.isInteger(photoId)) return res.status(400).json({ message: "Invalid photo id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.siteActivityPhoto.findFirst({ where: { id: photoId, report: { organizationId } } });
      if (!existing) return res.status(404).json({ message: "Photo not found" });

      await prisma.siteActivityPhoto.delete({ where: { id: photoId } });
      return res.status(200).json({ message: "Photo deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
