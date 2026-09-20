import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { SaveMaterialFieldDto } from "../dto/material.dto";
import { VALID_COLUMN_DATA_TYPES } from "../dto/customTableCells.dto";

const shapeField = (field: { id: number; name: string; dataType: string; sortOrder: number }) => ({
  id: field.id,
  name: field.name,
  dataType: field.dataType,
  sortOrder: field.sortOrder,
});

/** Manages the Materials page's project-scoped custom field definitions
 * (e.g. "Brand", "Storage Location") shown as extra columns on the Material
 * Stock table — distinct from MaterialCustomTableController's freeform extra
 * tabs: these fields live directly on the Material master row (see
 * Material.customFields in schema.prisma). */
export class MaterialFieldController {
  /** GET /material-fields?projectId — any org member (needed just to render
   * the Material Stock table's extra columns). */
  static list = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt(req.query.projectId as string, 10);
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const fields = await prisma.materialField.findMany({
        where: { organizationId, projectId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return res.status(200).json({ fields: fields.map(shapeField) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /material-fields?projectId — adds a field (admin-only, structural change). */
  static create = async (req: AuthRequest, res: Response) => {
    const projectId = parseInt((req.query.projectId as string) ?? (req.body.projectId as string), 10);
    const body: SaveMaterialFieldDto = req.body;
    const name = (body.name || "").trim();
    if (!Number.isInteger(projectId)) return res.status(400).json({ message: "projectId is required" });
    if (!name) return res.status(400).json({ message: "Field name is required" });
    if (!VALID_COLUMN_DATA_TYPES.has(body.dataType)) {
      return res.status(400).json({ message: "dataType must be one of text, number, date, boolean" });
    }

    try {
      const organizationId = req.organization!.id;
      const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
      if (!project) return res.status(404).json({ message: "Project not found in this organization" });

      const count = await prisma.materialField.count({ where: { organizationId, projectId } });
      const field = await prisma.materialField.create({
        data: { organizationId, projectId, name, dataType: body.dataType, sortOrder: count },
      });
      return res.status(201).json({ field: shapeField(field) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /material-fields/:id — rename / change type (admin-only). */
  static update = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const fieldId = parseInt(id as string, 10);
    if (!Number.isInteger(fieldId)) return res.status(400).json({ message: "Invalid field id" });

    const body: SaveMaterialFieldDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Field name is required" });
    if (!VALID_COLUMN_DATA_TYPES.has(body.dataType)) {
      return res.status(400).json({ message: "dataType must be one of text, number, date, boolean" });
    }

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialField.findFirst({ where: { id: fieldId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Field not found" });

      const updated = await prisma.materialField.update({
        where: { id: fieldId },
        data: { name, dataType: body.dataType },
      });
      return res.status(200).json({ field: shapeField(updated) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /material-fields/:id (admin-only) — existing materials keep the
   * now-orphaned key in their `customFields` JSON (ignored on read), same
   * convention as MaterialCustomColumn/PlantReportColumn deletion. */
  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const fieldId = parseInt(id as string, 10);
    if (!Number.isInteger(fieldId)) return res.status(400).json({ message: "Invalid field id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.materialField.findFirst({ where: { id: fieldId, organizationId } });
      if (!existing) return res.status(404).json({ message: "Field not found" });

      await prisma.materialField.delete({ where: { id: fieldId } });
      return res.status(200).json({ message: "Field deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
