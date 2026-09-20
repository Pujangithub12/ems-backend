import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import {
  SaveMaterialCustomTableDto,
  SaveMaterialCustomColumnDto,
  SaveMaterialCustomRowDto,
  SaveMaterialCustomImportSheetDto,
  VALID_COLUMN_DATA_TYPES,
  coerceRowValues,
} from "../dto/materialCustomTable.dto";

const shapeTable = (table: { id: number; name: string; sortOrder: number }) => ({
  id: table.id,
  name: table.name,
  sortOrder: table.sortOrder,
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

/** Manages the Materials page's optional custom spreadsheet tabs — an
 * additional, freeform set of user-defined tables (own columns/rows, Excel
 * import) alongside the page's fixed stock-ledger tabs, identical mechanic
 * to PlantReportTableController but namespaced separately since it's an
 * unrelated addition, not a replacement of the stock ledger. */
export class MaterialCustomTableController {
  /** GET /material-custom-tables?projectId — lists this project's custom
   * tabs (no columns/rows — kept light for the tab bar). Unlike Plant
   * Report, nothing is auto-seeded: an empty list is a normal state until
   * an admin adds the first tab. */
  static list = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt(req.query.projectId as string, 10);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const tables = await prisma.materialCustomTable.findMany({
        where: { organizationId, projectId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });

      return res.status(200).json({ tables: tables.map(shapeTable) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /material-custom-tables/:id — one table's columns + rows. */
  static getById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.materialCustomTable.findFirst({
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

  /** POST /material-custom-tables?projectId — creates a new tab (admin-only, roleMiddleware on the route). */
  static create = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt((req.query.projectId as string) ?? (req.body.projectId as string), 10);
    const body: SaveMaterialCustomTableDto = req.body;
    const name = (body.name || "").trim();
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    if (!name) return res.status(400).json({ message: "Table name is required" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const count = await prisma.materialCustomTable.count({ where: { organizationId, projectId } });
      const table = await prisma.materialCustomTable.create({
        data: { organizationId, projectId, name, sortOrder: count },
      });
      return res.status(201).json({ table: shapeTable(table) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /material-custom-tables/:id — rename (admin-only). */
  static update = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SaveMaterialCustomTableDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Table name is required" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialCustomTable.findFirst({ where: { id: tableId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Table not found" });

      const updated = await prisma.materialCustomTable.update({ where: { id: tableId }, data: { name } });
      return res.status(200).json({ table: shapeTable(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /material-custom-tables/:id (admin-only) — cascades to its columns/rows. */
  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialCustomTable.findFirst({ where: { id: tableId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Table not found" });

      await prisma.materialCustomTable.delete({ where: { id: tableId } });
      return res.status(200).json({ message: "Table deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /material-custom-tables/:id/columns — adds a column (admin-only). */
  static createColumn = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SaveMaterialCustomColumnDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Column name is required" });
    if (!VALID_COLUMN_DATA_TYPES.has(body.dataType)) {
      return res.status(400).json({ message: "dataType must be one of text, number, date, boolean" });
    }

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.materialCustomTable.findFirst({ where: { id: tableId, organizationId } });
      if (!table) return res.status(404).json({ message: "Table not found" });

      const targetNum = Number(body.target);
      const target = body.target != null && body.target !== ("" as unknown) && Number.isFinite(targetNum) ? targetNum : null;

      const count = await prisma.materialCustomColumn.count({ where: { tableId } });
      const column = await prisma.materialCustomColumn.create({
        data: { tableId, name, dataType: body.dataType, sortOrder: count, target },
      });
      return res.status(201).json({ column: shapeColumn(column) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /material-custom-columns/:id — rename / change type (admin-only). */
  static updateColumn = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const columnId = parseInt(id as string, 10);
    if (!Number.isInteger(columnId)) return res.status(400).json({ message: "Invalid column id" });

    const body: SaveMaterialCustomColumnDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Column name is required" });
    if (!VALID_COLUMN_DATA_TYPES.has(body.dataType)) {
      return res.status(400).json({ message: "dataType must be one of text, number, date, boolean" });
    }

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialCustomColumn.findFirst({ where: { id: columnId, table: { organizationId } } });
      if (!existing) return res.status(404).json({ message: "Column not found" });

      const targetNum = Number(body.target);
      const target = body.target != null && body.target !== ("" as unknown) && Number.isFinite(targetNum) ? targetNum : null;

      const updated = await prisma.materialCustomColumn.update({
        where: { id: columnId },
        data: { name, dataType: body.dataType, target },
      });
      return res.status(200).json({ column: shapeColumn(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /material-custom-columns/:id (admin-only) — existing rows keep
   * the now-orphaned key in their `values` JSON (ignored on read), same
   * convention as Plant Report's identical mechanic. */
  static removeColumn = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const columnId = parseInt(id as string, 10);
    if (!Number.isInteger(columnId)) return res.status(400).json({ message: "Invalid column id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialCustomColumn.findFirst({ where: { id: columnId, table: { organizationId } } });
      if (!existing) return res.status(404).json({ message: "Column not found" });

      await prisma.materialCustomColumn.delete({ where: { id: columnId } });
      return res.status(200).json({ message: "Column deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /material-custom-tables/:id/rows — adds a row (any org member). */
  static createRow = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SaveMaterialCustomRowDto = req.body;

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.materialCustomTable.findFirst({
        where: { id: tableId, organizationId },
        include: { columns: true },
      });
      if (!table) return res.status(404).json({ message: "Table not found" });

      const count = await prisma.materialCustomRow.count({ where: { tableId } });
      const row = await prisma.materialCustomRow.create({
        data: { tableId, sortOrder: count, values: coerceRowValues(table.columns, body.values) },
      });
      return res.status(201).json({ row: shapeRow(row) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /material-custom-rows/:id — full replace of a row's cell values (any org member). */
  static updateRow = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const rowId = parseInt(id as string, 10);
    if (!Number.isInteger(rowId)) return res.status(400).json({ message: "Invalid row id" });

    const body: SaveMaterialCustomRowDto = req.body;

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialCustomRow.findFirst({
        where: { id: rowId, table: { organizationId } },
        include: { table: { include: { columns: true } } },
      });
      if (!existing) return res.status(404).json({ message: "Row not found" });

      const updated = await prisma.materialCustomRow.update({
        where: { id: rowId },
        data: { values: coerceRowValues(existing.table.columns, body.values) },
      });
      return res.status(200).json({ row: shapeRow(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /material-custom-rows/:id (any org member). */
  static removeRow = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const rowId = parseInt(id as string, 10);
    if (!Number.isInteger(rowId)) return res.status(400).json({ message: "Invalid row id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialCustomRow.findFirst({ where: { id: rowId, table: { organizationId } } });
      if (!existing) return res.status(404).json({ message: "Row not found" });

      await prisma.materialCustomRow.delete({ where: { id: rowId } });
      return res.status(200).json({ message: "Row deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /material-custom-tables/:id/import — bulk-imports an uploaded
   * spreadsheet (any org member, same permission level as adding a row).
   * Columns are never created here — see PlantReportTableController.importSheet
   * for the identical rationale. */
  static importSheet = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const tableId = parseInt(id as string, 10);
    if (!Number.isInteger(tableId)) return res.status(400).json({ message: "Invalid table id" });

    const body: SaveMaterialCustomImportSheetDto = req.body;
    if (!Array.isArray(body.rows)) {
      return res.status(400).json({ message: "rows are required" });
    }

    try {
      const organizationId = req.organization!.id;
      const table = await prisma.materialCustomTable.findFirst({
        where: { id: tableId, organizationId },
        include: { columns: true },
      });
      if (!table) return res.status(404).json({ message: "Table not found" });

      const result = await prisma.$transaction(async (tx) => {
        let rowSortOrder = await tx.materialCustomRow.count({ where: { tableId } });
        let rowsCreated = 0;
        for (const rawRow of body.rows) {
          if (!rawRow || typeof rawRow !== "object") continue;
          const values = coerceRowValues(table.columns, rawRow);
          if (Object.keys(values).length === 0) continue;
          await tx.materialCustomRow.create({ data: { tableId, sortOrder: rowSortOrder++, values } });
          rowsCreated++;
        }

        return { rowsCreated };
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
