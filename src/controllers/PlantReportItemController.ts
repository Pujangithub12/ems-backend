import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { SavePlantReportItemDto } from "../dto/plant-report.dto";

const shapeItem = (item: {
  id: number;
  name: string;
  unit: string;
  trackStock: boolean;
  isActive: boolean;
  sortOrder: number;
}) => ({
  id: item.id,
  name: item.name,
  unit: item.unit,
  trackStock: item.trackStock,
  isActive: item.isActive,
  sortOrder: item.sortOrder,
});

/** Manages the org-defined tracked items (Pellets, Diesel, ...) that show up
 * as repeatable rows on the Plant Report daily entry form — separate from
 * PlantReportController (which manages the report + item readings)
 * following this codebase's split-by-responsibility convention, same as
 * PlantReportFieldController does for custom fields. */
export class PlantReportItemController {
  /** GET /plant-report-items — every item defined for this organization, in
   * display order. Any authenticated org member can read these (needed to
   * render the daily entry form). Pass ?includeInactive=1 to also get
   * disabled items (for historical report views / admin screens). */
  static list = async (req: AuthRequest, res: Response) => {
    try {
      const organizationId = req.organization!.id;
      const includeInactive = req.query.includeInactive === "1";
      const items = await prisma.plantReportItem.findMany({
        where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return res.status(200).json({ items: items.map(shapeItem) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /plant-report-items — admin-only (roleMiddleware on the route):
   * defining what items exist is an organization-wide schema change. */
  static create = async (req: AuthRequest, res: Response) => {
    const body: SavePlantReportItemDto = req.body;
    const name = (body.name || "").trim();
    const unit = (body.unit || "").trim();
    if (!name) return res.status(400).json({ message: "Item name is required" });
    if (!unit) return res.status(400).json({ message: "Unit is required" });

    try {
      const organizationId = req.organization!.id;
      const count = await prisma.plantReportItem.count({ where: { organizationId } });
      const item = await prisma.plantReportItem.create({
        data: {
          organizationId,
          name,
          unit,
          trackStock: body.trackStock ?? true,
          isActive: body.isActive ?? true,
          sortOrder: count,
        },
      });
      return res.status(201).json({ item: shapeItem(item) });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({ message: "An item with this name already exists" });
      }
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /plant-report-items/:id — rename, change unit, toggle stock
   * tracking, or enable/disable. Existing PlantReportItemEntry rows for
   * this item are left as-is. */
  static update = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const itemId = parseInt(id as string, 10);
    if (!Number.isInteger(itemId)) return res.status(400).json({ message: "Invalid item id" });

    const body: SavePlantReportItemDto = req.body;
    const name = (body.name || "").trim();
    const unit = (body.unit || "").trim();
    if (!name) return res.status(400).json({ message: "Item name is required" });
    if (!unit) return res.status(400).json({ message: "Unit is required" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportItem.findFirst({
        where: { id: itemId, organizationId },
      });
      if (!existing) return res.status(404).json({ message: "Item not found" });

      const updated = await prisma.plantReportItem.update({
        where: { id: itemId },
        data: {
          name,
          unit,
          trackStock: body.trackStock ?? existing.trackStock,
          isActive: body.isActive ?? existing.isActive,
        },
      });
      return res.status(200).json({ item: shapeItem(updated) });
    } catch (error: any) {
      if (error?.code === "P2002") {
        return res.status(409).json({ message: "An item with this name already exists" });
      }
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /plant-report-items/:id — prefer disabling (PUT isActive=false)
   * over deleting once an item has history; this hard-deletes and cascades
   * its PlantReportItemEntry rows (see schema's onDelete: Cascade), which
   * will erase past readings for that item from historical reports. */
  static remove = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const itemId = parseInt(id as string, 10);
    if (!Number.isInteger(itemId)) return res.status(400).json({ message: "Invalid item id" });

    try {
      const organizationId = req.organization!.id;
      const existing = await prisma.plantReportItem.findFirst({
        where: { id: itemId, organizationId },
      });
      if (!existing) return res.status(404).json({ message: "Item not found" });

      await prisma.plantReportItem.delete({ where: { id: itemId } });
      return res.status(200).json({ message: "Item deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
