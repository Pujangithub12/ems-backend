import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import {
  SavePlantReportTableDto,
  SavePlantReportColumnDto,
  SavePlantReportRowDto,
  SaveImportSheetDto,
  PlantReportCellValue,
  VALID_COLUMN_DATA_TYPES,
  coerceRowValues,
  coerceCellValue,
} from "../dto/plantReport.dto";

const shapeTable = (table: { id: number; name: string; sortOrder: number; isDefault: boolean }) => ({
  id: table.id,
  name: table.name,
  sortOrder: table.sortOrder,
  isDefault: table.isDefault,
});

const shapeColumn = (column: { id: number; name: string; dataType: string; sortOrder: number; target: number | null }) => ({
  id: column.id,
  name: column.name,
  dataType: column.dataType,
  sortOrder: column.sortOrder,
  target: column.target,
});

const shapeRow = (row: { id: number; sortOrder: number; values: unknown }) => ({
  id: row.id,
  sortOrder: row.sortOrder,
  values: (row.values as Record<string, unknown> | null) ?? {},
});

/** Manages the Plant Report page's project-scoped custom tables ("tabs") —
 * each with its own user-defined columns and rows, replacing the old fixed
 * Daily Log / Work Activities / Manpower / etc. feature entirely per the
 * redesign: every tab is now a generic spreadsheet, "Progress Tracker" being
 * just the first one auto-created for a project. */
export class PlantReportTableController {
  /** GET /plant-report-tables?projectId — lists this project's tables
   * (no columns/rows — kept light for the tab bar). Auto-creates a
   * "Progress Tracker" table the first time a project has none, so every
   * project always has at least one tab (mirrors the default-organization
   * seeding convention used elsewhere in this app). */
  static list = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt(req.query.projectId as string, 10);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      let tables = await prisma.plantReportTable.findMany({
        where: { organizationId, projectId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });

      if (tables.length === 0) {
        const seeded = await prisma.plantReportTable.create({
          data: {
            organizationId,
            projectId,
            name: "Progress Tracker",
            sortOrder: 0,
            isDefault: true,
            columns: { create: { name: "Date", dataType: "date", sortOrder: 0 } },
          },
        });
        tables = [seeded];
      }

      return res.status(200).json({ tables: tables.map(shapeTable) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /plant-report-tables/:id — one table's columns + rows. */
  static getById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.plantReportTable.findFirst({
        where: { id: tableId, organizationId },
        include: {
          columns: { orderBy: { sortOrder: "asc" } },
          rows: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!table) return res.status(404).json({ message: "Table not found" });

      return res.status(200).json({
        table: shapeTable(table),
        columns: table.columns.map(shapeColumn),
        rows: table.rows.map(shapeRow),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /plant-report-tables?projectId — creates a new tab (admin-only, roleMiddleware on the route). */
  static create = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt((req.query.projectId as string) ?? (req.body.projectId as string), 10);
    const body: SavePlantReportTableDto = req.body;
    const name = (body.name || "").trim();
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    if (!name) return res.status(400).json({ message: "Table name is required" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const count = await prisma.plantReportTable.count({ where: { organizationId, projectId } });
      const table = await prisma.plantReportTable.create({
        data: { organizationId, projectId, name, sortOrder: count },
      });
      return res.status(201).json({ table: shapeTable(table) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /plant-report-tables/:id — rename (admin-only). */
  static update = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SavePlantReportTableDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Table name is required" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportTable.findFirst({ where: { id: tableId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Table not found" });
      if (existing.isDefault) return res.status(403).json({ message: "The default Progress Tracker tab can't be renamed" });

      const updated = await prisma.plantReportTable.update({ where: { id: tableId }, data: { name } });
      return res.status(200).json({ table: shapeTable(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /plant-report-tables/:id (admin-only) — cascades to its columns/rows. */
  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportTable.findFirst({ where: { id: tableId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Table not found" });
      if (existing.isDefault) return res.status(403).json({ message: "The default Progress Tracker tab can't be deleted" });

      await prisma.plantReportTable.delete({ where: { id: tableId } });
      return res.status(200).json({ message: "Table deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /plant-report-tables/:id/columns — adds a column (admin-only). */
  static createColumn = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SavePlantReportColumnDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Column name is required" });
    if (!VALID_COLUMN_DATA_TYPES.has(body.dataType)) {
      return res.status(400).json({ message: "dataType must be one of text, number, date, boolean" });
    }

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.plantReportTable.findFirst({ where: { id: tableId, organizationId } });
      if (!table) return res.status(404).json({ message: "Table not found" });

      const targetNum = Number(body.target);
      const target = body.target != null && body.target !== ("" as unknown) && Number.isFinite(targetNum) ? targetNum : null;

      const count = await prisma.plantReportColumn.count({ where: { tableId } });
      const column = await prisma.plantReportColumn.create({
        data: { tableId, name, dataType: body.dataType, sortOrder: count, target },
      });
      return res.status(201).json({ column: shapeColumn(column) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /plant-report-columns/:id — rename / change type (admin-only). */
  static updateColumn = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const columnId = parseInt(id as string, 10);
    if (!Number.isInteger(columnId)) return res.status(400).json({ message: "Invalid column id" });

    const body: SavePlantReportColumnDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Column name is required" });
    if (!VALID_COLUMN_DATA_TYPES.has(body.dataType)) {
      return res.status(400).json({ message: "dataType must be one of text, number, date, boolean" });
    }

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportColumn.findFirst({
        where: { id: columnId, table: { organizationId } },
        include: { table: { select: { isDefault: true } } },
      });
      if (!existing) return res.status(404).json({ message: "Column not found" });

      if (existing.table.isDefault && existing.dataType === "date" && body.dataType !== "date") {
        const otherDateColumns = await prisma.plantReportColumn.count({
          where: { tableId: existing.tableId, dataType: "date", id: { not: columnId } },
        });
        if (otherDateColumns === 0) {
          return res.status(403).json({ message: "Progress Tracker must keep at least one Date column" });
        }
      }

      const targetNum = Number(body.target);
      const target = body.target != null && body.target !== ("" as unknown) && Number.isFinite(targetNum) ? targetNum : null;

      const updated = await prisma.plantReportColumn.update({
        where: { id: columnId },
        data: { name, dataType: body.dataType, target },
      });
      return res.status(200).json({ column: shapeColumn(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /plant-report-columns/:id (admin-only) — existing rows keep the
   * now-orphaned key in their `values` JSON (ignored on read), same
   * convention as this app's other org-defined-field features. Blocked if
   * it's the Progress Tracker's only remaining Date column. */
  static removeColumn = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const columnId = parseInt(id as string, 10);
    if (!Number.isInteger(columnId)) return res.status(400).json({ message: "Invalid column id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportColumn.findFirst({
        where: { id: columnId, table: { organizationId } },
        include: { table: { select: { isDefault: true } } },
      });
      if (!existing) return res.status(404).json({ message: "Column not found" });

      if (existing.table.isDefault && existing.dataType === "date") {
        const otherDateColumns = await prisma.plantReportColumn.count({
          where: { tableId: existing.tableId, dataType: "date", id: { not: columnId } },
        });
        if (otherDateColumns === 0) {
          return res.status(403).json({ message: "Progress Tracker must keep at least one Date column" });
        }
      }

      await prisma.plantReportColumn.delete({ where: { id: columnId } });
      return res.status(200).json({ message: "Column deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /plant-report-tables/:id/rows — adds a row (any org member). */
  static createRow = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SavePlantReportRowDto = req.body;

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.plantReportTable.findFirst({
        where: { id: tableId, organizationId },
        include: { columns: true },
      });
      if (!table) return res.status(404).json({ message: "Table not found" });

      const count = await prisma.plantReportRow.count({ where: { tableId } });
      const row = await prisma.plantReportRow.create({
        data: { tableId, sortOrder: count, values: coerceRowValues(table.columns, body.values) },
      });
      return res.status(201).json({ row: shapeRow(row) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /plant-report-rows/:id — full replace of a row's cell values (any org member). */
  static updateRow = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const rowId = parseInt(id as string, 10);
    if (!Number.isInteger(rowId)) return res.status(400).json({ message: "Invalid row id" });

    const body: SavePlantReportRowDto = req.body;

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportRow.findFirst({
        where: { id: rowId, table: { organizationId } },
        include: { table: { include: { columns: true } } },
      });
      if (!existing) return res.status(404).json({ message: "Row not found" });

      const updated = await prisma.plantReportRow.update({
        where: { id: rowId },
        data: { values: coerceRowValues(existing.table.columns, body.values) },
      });
      return res.status(200).json({ row: shapeRow(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /plant-report-rows/:id (any org member). */
  static removeRow = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const rowId = parseInt(id as string, 10);
    if (!Number.isInteger(rowId)) return res.status(400).json({ message: "Invalid row id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportRow.findFirst({ where: { id: rowId, table: { organizationId } } });
      if (!existing) return res.status(404).json({ message: "Row not found" });

      await prisma.plantReportRow.delete({ where: { id: rowId } });
      return res.status(200).json({ message: "Row deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /plant-report-tables/:id/import — bulk-imports an uploaded
   * spreadsheet (any org member, same permission level as adding a row —
   * this is data entry, just many rows at once). The file itself is parsed
   * client-side (into a header list + row objects keyed by header name);
   * this endpoint reuses any existing column whose name matches a header
   * (case-insensitively) and creates a new column for every header that
   * doesn't, so a sheet with any number/shape of columns "just works". */
  static importSheet = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SaveImportSheetDto = req.body;
    if (!Array.isArray(body.columns) || !Array.isArray(body.rows)) {
      return res.status(400).json({ message: "columns and rows are required" });
    }

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.plantReportTable.findFirst({
        where: { id: tableId, organizationId },
        include: { columns: true },
      });
      if (!table) return res.status(404).json({ message: "Table not found" });

      const result = await prisma.$transaction(async (tx) => {
        const byName = new Map<string, { id: number; dataType: string }>();
        for (const c of table.columns) byName.set(c.name.trim().toLowerCase(), { id: c.id, dataType: c.dataType });

        let sortOrder = table.columns.length;
        let columnsCreated = 0;
        for (const col of body.columns) {
          const name = (col.name || "").trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (byName.has(key)) continue;
          const dataType = VALID_COLUMN_DATA_TYPES.has(col.dataType) ? col.dataType : "text";
          const created = await tx.plantReportColumn.create({ data: { tableId, name, dataType, sortOrder: sortOrder++ } });
          byName.set(key, { id: created.id, dataType: created.dataType });
          columnsCreated++;
        }

        let rowSortOrder = await tx.plantReportRow.count({ where: { tableId } });
        let rowsCreated = 0;
        for (const rawRow of body.rows) {
          if (!rawRow || typeof rawRow !== "object") continue;
          const values: Record<string, PlantReportCellValue> = {};
          for (const [name, val] of Object.entries(rawRow)) {
            const col = byName.get(name.trim().toLowerCase());
            if (!col) continue;
            values[String(col.id)] = coerceCellValue(val, col.dataType);
          }
          await tx.plantReportRow.create({ data: { tableId, sortOrder: rowSortOrder++, values } });
          rowsCreated++;
        }

        return { columnsCreated, rowsCreated };
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
