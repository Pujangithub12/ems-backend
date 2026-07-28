import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { AddCatalogItemDto } from "../dto/catalogItem.dto";

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
      return res.status(500).json({ message: "Internal server error", error });
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
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
