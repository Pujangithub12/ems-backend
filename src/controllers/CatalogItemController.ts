import { Response } from "express";
import { ILike } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { CatalogItem } from "../entities/CatalogItem";
import { AuthRequest } from "../middlewares/auth";
import { AddCatalogItemDto } from "../dto/catalogItem.dto";

export class CatalogItemController {
  /** GET /workspace/items — list the shared item catalog for pickers on the Inventory and Procurement "Add item" forms. */
  static getWorkspaceItems = async (req: AuthRequest, res: Response) => {
    try {
      const itemRepository = AppDataSource.getRepository(CatalogItem);
      const items = await itemRepository.find({
        where: { workspace: { id: req.workspace!.id } },
        order: { name: "ASC" },
      });
      return res.status(200).json({ items });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /workspace/items — add a new item (name + code) to the shared catalog. */
  static createItem = async (req: AuthRequest, res: Response) => {
    const { name, code }: AddCatalogItemDto = req.body;
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ message: "Item name is required" });
    }
    try {
      const itemRepository = AppDataSource.getRepository(CatalogItem);
      const existing = await itemRepository.findOne({
        where: { workspace: { id: req.workspace!.id }, name: ILike(trimmedName) },
      });
      if (existing) {
        return res.status(400).json({ message: "An item with this name already exists" });
      }
      const item = itemRepository.create({
        name: trimmedName,
        workspace: req.workspace!,
        ...(code?.trim() ? { code: code.trim() } : {}),
      });
      await itemRepository.save(item);
      return res.status(201).json({ message: "Item created", item });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
