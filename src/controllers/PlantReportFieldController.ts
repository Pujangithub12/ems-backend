import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { SavePlantReportFieldDto, PlantReportFieldDataType } from "../dto/plant-report.dto";

const VALID_DATA_TYPES: PlantReportFieldDataType[] = ["text", "number", "date", "boolean"];

const shapeField = (field: { id: number; name: string; dataType: string; sortOrder: number }) => ({
  id: field.id,
  name: field.name,
  dataType: field.dataType as PlantReportFieldDataType,
  sortOrder: field.sortOrder,
});

/** Manages the org-defined extra columns ("custom fields") that show up on
 * the Plant Report daily entry form and monthly table — separate from
 * PlantReportController (which manages the report rows/values themselves)
 * following this codebase's split-by-responsibility convention. */
export class PlantReportFieldController {
  /** GET /plant-report-fields — every custom field defined for this
   * organization, in display order. Any authenticated org member can read
   * these (they're needed just to render the daily entry form). */
  static list = async (req: AuthRequest, res: Response) => {
    try {
      const organizationId = req.organization!.id;
      const fields = await prisma.plantReportCustomField.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return res.status(200).json({ fields: fields.map(shapeField) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /plant-report-fields — admin-only (roleMiddleware on the route):
   * defining what fields exist is an organization-wide schema change, not a
   * per-entry edit. */
  static create = async (req: AuthRequest, res: Response) => {
    const body: SavePlantReportFieldDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Field name is required" });
    if (!VALID_DATA_TYPES.includes(body.dataType)) {
      return res.status(400).json({ message: "Invalid data type" });
    }

    try {
      const organizationId = req.organization!.id;
      const count = await prisma.plantReportCustomField.count({ where: { organizationId } });
      const field = await prisma.plantReportCustomField.create({
        data: { organizationId, name, dataType: body.dataType, sortOrder: count },
      });
      return res.status(201).json({ field: shapeField(field) });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({ message: "A field with this name already exists" });
      }
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /plant-report-fields/:id — rename and/or change the data type.
   * Existing stored values for this field on past reports are left as-is;
   * the frontend renders whatever's there with the field's *current* type. */
  static update = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const fieldId = parseInt(id as string, 10);
    if (!Number.isInteger(fieldId)) return res.status(400).json({ message: "Invalid field id" });

    const body: SavePlantReportFieldDto = req.body;
    const name = (body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Field name is required" });
    if (!VALID_DATA_TYPES.includes(body.dataType)) {
      return res.status(400).json({ message: "Invalid data type" });
    }

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportCustomField.findFirst({
        where: { id: fieldId, organizationId },
      });
      if (!existing) return res.status(404).json({ message: "Field not found" });

      const updated = await prisma.plantReportCustomField.update({
        where: { id: fieldId },
        data: { name, dataType: body.dataType },
      });
      return res.status(200).json({ field: shapeField(updated) });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({ message: "A field with this name already exists" });
      }
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /plant-report-fields/:id — removes the field definition. Values
   * already stored under this field's id in older reports' customValues JSON
   * are left in place (harmless — the frontend only renders keys that match
   * a currently-defined field). */
  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const fieldId = parseInt(id as string, 10);
    if (!Number.isInteger(fieldId)) return res.status(400).json({ message: "Invalid field id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportCustomField.findFirst({
        where: { id: fieldId, organizationId },
      });
      if (!existing) return res.status(404).json({ message: "Field not found" });

      await prisma.plantReportCustomField.delete({ where: { id: fieldId } });
      return res.status(200).json({ message: "Field deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
