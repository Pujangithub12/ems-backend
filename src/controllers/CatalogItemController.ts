import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { AddCatalogItemDto, UpdateCatalogItemDto } from "../dto/catalogItem.dto";

export class CatalogItemController {
  /** GET /organization/items — list the shared item catalog for pickers on the Inventory and Procurement "Add item" forms. */
  static getOrganizationItems = async (req: AuthRequest, res: Response) => {
    try {
      const items = await prisma.catalogItem.findMany({
        where: { organizationId: req.organization!.id },
        orderBy: { name: "asc" },
      });
      return res.status(200).json({ items });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** POST /organization/items — add a new item (name + code) to the shared catalog. */
  static createItem = async (req: AuthRequest, res: Response) => {
    const { name, code }: AddCatalogItemDto = req.body;
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ message: "Item name is required" });
    }
    try {
      const existing = await prisma.catalogItem.findFirst({
        where: {
          organizationId: req.organization!.id,
          name: { equals: trimmedName, mode: "insensitive" },
        },
      });
      if (existing) {
        return res.status(400).json({ message: "An item with this name already exists" });
      }
      const item = await prisma.catalogItem.create({
        data: {
          name: trimmedName,
          organizationId: req.organization!.id,
          ...(code?.trim() ? { code: code.trim() } : {}),
        },
      });
      return res.status(201).json({ message: "Item created", item });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** PUT /organization/items/:itemId — rename/re-code a catalog item. */
  static updateItem = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const { name, code }: UpdateCatalogItemDto = req.body;
    try {
      const item = await prisma.catalogItem.findFirst({
        where: { id: parseInt(itemId as string), organizationId: req.organization!.id },
      });
      if (!item) return res.status(404).json({ message: "Item not found" });

      const data: any = {};
      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) return res.status(400).json({ message: "Item name is required" });
        const duplicate = await prisma.catalogItem.findFirst({
          where: {
            organizationId: req.organization!.id,
            name: { equals: trimmedName, mode: "insensitive" },
            NOT: { id: item.id },
          },
        });
        if (duplicate) return res.status(400).json({ message: "An item with this name already exists" });
        data.name = trimmedName;
      }
      if (code !== undefined) data.code = code.trim() || null;

      const updatedItem = await prisma.catalogItem.update({ where: { id: item.id }, data });
      return res.status(200).json({ message: "Item updated", item: updatedItem });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** DELETE /organization/items/:itemId — Purchase Order/Proforma Invoice/Inventory rows referencing this item fall back to their free-text name (onDelete: SetNull on the relation). */
  static deleteItem = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    try {
      const item = await prisma.catalogItem.findFirst({
        where: { id: parseInt(itemId as string), organizationId: req.organization!.id },
      });
      if (!item) return res.status(404).json({ message: "Item not found" });

      await prisma.catalogItem.delete({ where: { id: item.id } });
      return res.status(200).json({ message: "Item deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
