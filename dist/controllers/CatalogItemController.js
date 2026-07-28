"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogItemController = void 0;
const prisma_1 = require("../config/prisma");
class CatalogItemController {
    /** GET /organization/items — list the shared item catalog for pickers on the Inventory and Procurement "Add item" forms. */
    static getOrganizationItems = async (req, res) => {
        try {
            const items = await prisma_1.prisma.catalogItem.findMany({
                where: { organizationId: req.organization.id },
                orderBy: { name: "asc" },
            });
            return res.status(200).json({ items });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
    /** POST /organization/items — add a new item (name + code) to the shared catalog. */
    static createItem = async (req, res) => {
        const { name, code } = req.body;
        const trimmedName = name?.trim();
        if (!trimmedName) {
            return res.status(400).json({ message: "Item name is required" });
        }
        try {
            const existing = await prisma_1.prisma.catalogItem.findFirst({
                where: {
                    organizationId: req.organization.id,
                    name: { equals: trimmedName, mode: "insensitive" },
                },
            });
            if (existing) {
                return res.status(400).json({ message: "An item with this name already exists" });
            }
            const item = await prisma_1.prisma.catalogItem.create({
                data: {
                    name: trimmedName,
                    organizationId: req.organization.id,
                    ...(code?.trim() ? { code: code.trim() } : {}),
                },
            });
            return res.status(201).json({ message: "Item created", item });
        }
        catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
        }
    };
}
exports.CatalogItemController = CatalogItemController;
//# sourceMappingURL=CatalogItemController.js.map