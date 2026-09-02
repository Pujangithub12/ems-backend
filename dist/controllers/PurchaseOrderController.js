"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrderController = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const permissionService_1 = require("../utils/permissionService");
const costSheet_1 = require("../utils/costSheet");
const purchaseOrderPdf_1 = require("../utils/purchaseOrderPdf");
const nepaliFiscalYear_1 = require("../utils/nepaliFiscalYear");
const supabaseStorage_1 = require("../config/supabaseStorage");
const PDF_INCLUDE = { vendor: true, organization: true, items: true };
const LIST_INCLUDE = {
    vendor: true,
    project: true,
    items: true,
    createdBy: { select: { id: true, fullName: true } },
    shipment: { select: { status: true } },
};
const DETAIL_INCLUDE = {
    vendor: true,
    project: true,
    createdBy: { select: { id: true, fullName: true } },
    items: { include: { item: true } },
    statusHistory: { include: { changedBy: true }, orderBy: { createdAt: "desc" } },
    proformaInvoices: { include: { items: true }, orderBy: { createdAt: "desc" } },
    shipment: { include: { insurance: true, customs: { include: { documents: true } }, letterOfCredit: true } },
    goodsReceipts: {
        include: { items: true, photos: true, warehouse: true, receivedBy: true },
        orderBy: { createdAt: "desc" },
    },
};
/** Purchase Order tab (procurement pipeline v2, step 3): created directly via createPurchaseOrder, then read/updated/tracked here through PI/Shipment/GRN. */
class PurchaseOrderController {
    /** GET /workspace/purchase-orders — aggregated across every project in the organization.
     * A plain admin only sees POs they created themselves; finance/super_admin see everything. */
    static getOrganizationPurchaseOrders = async (req, res) => {
        try {
            const purchaseOrders = await prisma_1.prisma.purchaseOrder.findMany({
                where: {
                    organizationId: req.organization.id,
                    ...(req.user.role === enums_1.UserRole.ADMIN ? { createdById: req.user.id } : {}),
                },
                include: LIST_INCLUDE,
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json({ purchaseOrders });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /projects/:projectId/purchase-orders — flat list for the project-scoped tab. Same
     * creator-scoping for plain admins as getOrganizationPurchaseOrders. */
    static getPurchaseOrders = async (req, res) => {
        const { projectId } = req.params;
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: { id: parseInt(projectId), organizationId: req.organization.id },
            });
            if (!project)
                return res.status(404).json({ message: "Project not found" });
            const purchaseOrders = await prisma_1.prisma.purchaseOrder.findMany({
                where: {
                    projectId: project.id,
                    ...(req.user.role === enums_1.UserRole.ADMIN ? { createdById: req.user.id } : {}),
                },
                include: LIST_INCLUDE,
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json({ purchaseOrders });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** Next incremental number for the current Nepali fiscal year, scoped to the organization —
     * looks at existing `{number}-{fiscalYear}` PO numbers for that fiscal year and takes the
     * highest + 1 (starting at 1). A manually-edited poNumber that doesn't match the pattern is
     * ignored rather than breaking the count. */
    static async nextPoNumber(organizationId) {
        const fiscalYear = (0, nepaliFiscalYear_1.currentNepaliFiscalYearLabel)();
        const suffix = `-${fiscalYear}`;
        const candidates = await prisma_1.prisma.purchaseOrder.findMany({
            where: { organizationId, poNumber: { endsWith: suffix } },
            select: { poNumber: true },
        });
        const pattern = new RegExp(`^(\\d+)${suffix.replace(/\//g, "\\/")}$`);
        let maxNumber = 0;
        for (const { poNumber } of candidates) {
            const match = poNumber?.match(pattern);
            if (match)
                maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
        }
        return `${maxNumber + 1}-${fiscalYear}`;
    }
    /** POST /projects/:projectId/purchase-orders (project-scoped) or POST /purchase-orders
     * (org-wide — project is optional, e.g. for a PO not yet tied to a specific project) —
     * creates a PO directly (vendor picked up front, no Purchase Request involved). Items are
     * optional at creation time — they're added one at a time afterward from the Overview tab's
     * Line Items section (see addPurchaseOrderItem). poNumber is auto-generated as "{number}-{nepali
     * fiscal year}" (e.g. "1-83/84"), incrementing per organization per fiscal year — still
     * editable afterward via updatePurchaseOrder, which enforces uniqueness on manual edits. */
    static createPurchaseOrder = async (req, res) => {
        const { vendorId, items, projectId: bodyProjectId } = req.body;
        const projectIdRaw = req.params.projectId ?? (bodyProjectId != null ? String(bodyProjectId) : undefined);
        if (items !== undefined) {
            if (!Array.isArray(items)) {
                return res.status(400).json({ message: "Items must be an array" });
            }
            for (const item of items) {
                if (!item || typeof item.itemName !== "string" || !item.itemName.trim()) {
                    return res.status(400).json({ message: "Every item needs a name" });
                }
            }
        }
        try {
            const organizationId = req.organization.id;
            let project = null;
            if (projectIdRaw) {
                project = await prisma_1.prisma.project.findFirst({
                    where: { id: parseInt(projectIdRaw), organizationId },
                });
                if (!project)
                    return res.status(404).json({ message: "Project not found" });
            }
            const poNumber = await PurchaseOrderController.nextPoNumber(organizationId);
            const createdPo = await prisma_1.prisma.purchaseOrder.create({
                data: {
                    organizationId,
                    projectId: project?.id ?? null,
                    vendorId: vendorId ?? null,
                    createdById: req.user.id,
                    poNumber,
                    status: "created",
                    items: {
                        create: (items ?? []).map((item) => ({
                            itemName: item.itemName.trim(),
                            itemId: item.itemId ?? null,
                            quantity: item.quantity ?? 1,
                            unit: item.unit ?? null,
                            unitPrice: item.unitPrice ?? null,
                            description: item.description ?? null,
                        })),
                    },
                },
            });
            const changedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            await prisma_1.prisma.purchaseOrderStatusHistory.create({
                data: {
                    toStatus: "created",
                    purchaseOrderId: createdPo.id,
                    ...(changedBy ? { changedById: changedBy.id } : {}),
                },
            });
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: createdPo.id },
                include: { vendor: true, project: true, items: true },
            });
            return res.status(201).json({ message: "Purchase order created", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static async loadOwnedPurchaseOrder(id, organizationId) {
        const purchaseOrder = await prisma_1.prisma.purchaseOrder.findFirst({
            where: { id: parseInt(id) },
        });
        if (!purchaseOrder || purchaseOrder.organizationId !== organizationId)
            return null;
        return purchaseOrder;
    }
    /** A plain admin may only see/act on POs they created themselves — finance/super_admin see
     * everything. Used everywhere loadOwnedPurchaseOrder gates access to a specific PO. */
    static isVisibleTo(purchaseOrder, req) {
        if (req.user.role !== enums_1.UserRole.ADMIN)
            return true;
        return purchaseOrder.createdById === req.user.id;
    }
    /** GET /purchase-orders/:id/detail — everything the PO detail screen needs across the whole downstream pipeline. */
    static getPurchaseOrderDetail = async (req, res) => {
        const { id } = req.params;
        try {
            const owned = await PurchaseOrderController.loadOwnedPurchaseOrder(id, req.organization.id);
            if (!owned || !PurchaseOrderController.isVisibleTo(owned, req)) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: owned.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(200).json({ purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** PUT /purchase-orders/:id — update terms/delivery/status fields. Any status change is
     * allowed here (no strict transition machine). Reachable by anyone holding the
     * "projects.procurement" permission (admin/super_admin by default) plus finance/super_admin
     * unconditionally. */
    static updatePurchaseOrder = async (req, res) => {
        const { id } = req.params;
        const { poNumber, paymentTerms, incoterms, taxPercent, terms, deliveryPeriod, finalDestination, customerContactPerson, currency, purchaseType, status, items, } = req.body;
        try {
            const canEdit = (await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.procurement")) ||
                req.user.role === enums_1.UserRole.FINANCE ||
                req.user.role === enums_1.UserRole.SUPER_ADMIN;
            if (!canEdit)
                return res.status(403).json({ message: "Forbidden" });
            const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id, req.organization.id);
            if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            const previousStatus = existing.status;
            const data = {};
            if (poNumber !== undefined) {
                const trimmed = poNumber.trim();
                if (!trimmed) {
                    return res.status(400).json({ message: "PO number cannot be empty" });
                }
                const duplicate = await prisma_1.prisma.purchaseOrder.findFirst({
                    where: { poNumber: trimmed, organizationId: req.organization.id, NOT: { id: existing.id } },
                });
                if (duplicate) {
                    return res.status(400).json({ message: `PO number "${trimmed}" is already in use by another purchase order` });
                }
                data.poNumber = trimmed;
            }
            if (paymentTerms !== undefined)
                data.paymentTerms = paymentTerms;
            if (incoterms !== undefined)
                data.incoterms = incoterms;
            if (taxPercent !== undefined)
                data.taxPercent = taxPercent;
            if (terms !== undefined)
                data.terms = terms;
            if (deliveryPeriod !== undefined)
                data.deliveryPeriod = deliveryPeriod;
            if (finalDestination !== undefined)
                data.finalDestination = finalDestination;
            if (customerContactPerson !== undefined)
                data.customerContactPerson = customerContactPerson;
            if (currency !== undefined)
                data.currency = currency;
            if (purchaseType !== undefined)
                data.purchaseType = purchaseType;
            if (status !== undefined)
                data.status = status;
            await prisma_1.prisma.purchaseOrder.update({ where: { id: existing.id }, data });
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (!item || typeof item.id !== "number")
                        continue;
                    await prisma_1.prisma.purchaseOrderItem.updateMany({
                        where: { id: item.id, purchaseOrderId: existing.id },
                        data: { hsnCode: item.hsnCode ?? null },
                    });
                }
            }
            if (status !== undefined && status !== previousStatus) {
                const changedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
                await prisma_1.prisma.purchaseOrderStatusHistory.create({
                    data: {
                        fromStatus: previousStatus,
                        toStatus: status,
                        purchaseOrderId: existing.id,
                        ...(changedBy ? { changedById: changedBy.id } : {}),
                    },
                });
            }
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: existing.id },
                include: { vendor: true, project: true },
            });
            return res.status(200).json({ message: "Purchase order updated", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /purchase-orders/:id/items — adds a single line item to an existing PO (used by the
     * "Add Item" form on the Overview tab, now that items are no longer collected at creation
     * time). Same edit permission as updatePurchaseOrder. */
    static addPurchaseOrderItem = async (req, res) => {
        const { id } = req.params;
        const { itemName, itemId, quantity, unit, unitPrice, description } = req.body;
        if (typeof itemName !== "string" || !itemName.trim()) {
            return res.status(400).json({ message: "Item name is required" });
        }
        if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ message: "A valid quantity is required" });
        }
        try {
            const canEdit = (await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.procurement")) ||
                req.user.role === enums_1.UserRole.FINANCE ||
                req.user.role === enums_1.UserRole.SUPER_ADMIN;
            if (!canEdit)
                return res.status(403).json({ message: "Forbidden" });
            const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id, req.organization.id);
            if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            await prisma_1.prisma.purchaseOrderItem.create({
                data: {
                    purchaseOrderId: existing.id,
                    itemName: itemName.trim(),
                    itemId: itemId ?? null,
                    quantity,
                    unit: unit ?? null,
                    unitPrice: unitPrice ?? null,
                    description: description?.trim() || null,
                },
            });
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: existing.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(201).json({ message: "Item added", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** Loads a PurchaseOrderItem scoped to both the given PO and organization — used by
     * editPurchaseOrderItem/deletePurchaseOrderItem so an itemId can't be aimed at another PO. */
    static async loadOwnedPurchaseOrderItem(poId, itemId, organizationId) {
        const po = await PurchaseOrderController.loadOwnedPurchaseOrder(poId, organizationId);
        if (!po)
            return null;
        const item = await prisma_1.prisma.purchaseOrderItem.findFirst({
            where: { id: parseInt(itemId), purchaseOrderId: po.id },
        });
        if (!item)
            return null;
        return { po, item };
    }
    /** PUT /purchase-orders/:id/items/:itemId — full edit of one line item (Overview tab's Line
     * Items table). Same edit permission as addPurchaseOrderItem. */
    static editPurchaseOrderItem = async (req, res) => {
        const { id, itemId } = req.params;
        const { itemName, itemId: catalogItemId, quantity, unit, unitPrice, description } = req.body;
        if (typeof itemName !== "string" || !itemName.trim()) {
            return res.status(400).json({ message: "Item name is required" });
        }
        if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ message: "A valid quantity is required" });
        }
        try {
            const canEdit = (await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.procurement")) ||
                req.user.role === enums_1.UserRole.FINANCE ||
                req.user.role === enums_1.UserRole.SUPER_ADMIN;
            if (!canEdit)
                return res.status(403).json({ message: "Forbidden" });
            const loaded = await PurchaseOrderController.loadOwnedPurchaseOrderItem(id, itemId, req.organization.id);
            if (!loaded || !PurchaseOrderController.isVisibleTo(loaded.po, req)) {
                return res.status(404).json({ message: "Purchase order item not found" });
            }
            await prisma_1.prisma.purchaseOrderItem.update({
                where: { id: loaded.item.id },
                data: {
                    itemName: itemName.trim(),
                    itemId: catalogItemId ?? null,
                    quantity,
                    unit: unit ?? null,
                    unitPrice: unitPrice ?? null,
                    description: description?.trim() || null,
                },
            });
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: loaded.po.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(200).json({ message: "Item updated", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /purchase-orders/:id/items/:itemId — removes one line item. Same edit permission as
     * addPurchaseOrderItem. Any goods receipt line items already recorded against this row keep
     * their own history but lose the link (onDelete: SetNull on GoodsReceiptItem.purchaseOrderItem). */
    static deletePurchaseOrderItem = async (req, res) => {
        const { id, itemId } = req.params;
        try {
            const canEdit = (await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.procurement")) ||
                req.user.role === enums_1.UserRole.FINANCE ||
                req.user.role === enums_1.UserRole.SUPER_ADMIN;
            if (!canEdit)
                return res.status(403).json({ message: "Forbidden" });
            const loaded = await PurchaseOrderController.loadOwnedPurchaseOrderItem(id, itemId, req.organization.id);
            if (!loaded || !PurchaseOrderController.isVisibleTo(loaded.po, req)) {
                return res.status(404).json({ message: "Purchase order item not found" });
            }
            await prisma_1.prisma.purchaseOrderItem.delete({ where: { id: loaded.item.id } });
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: loaded.po.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(200).json({ message: "Item deleted", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static async loadOwnedPurchaseOrderPayment(poId, paymentId, organizationId) {
        const po = await PurchaseOrderController.loadOwnedPurchaseOrder(poId, organizationId);
        if (!po)
            return null;
        const payment = await prisma_1.prisma.purchaseOrderPayment.findFirst({
            where: { id: parseInt(paymentId), purchaseOrderId: po.id },
        });
        if (!payment)
            return null;
        return { po, payment };
    }
    /** POST /purchase-orders/:id/payments — logs one installment paid against a PO (Finance
     * page). A PO can be paid in several installments, so this is additive, not a single-field
     * update. Same edit permission as addPurchaseOrderItem — finance must be able to log
     * payments even though finance doesn't hold "projects.procurement" by default. */
    static addPurchaseOrderPayment = async (req, res) => {
        const { id } = req.params;
        const { amount, paidDate, reference, notes } = req.body;
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "A valid amount is required" });
        }
        const parsedDate = paidDate ? new Date(paidDate) : null;
        if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({ message: "A valid paid date is required" });
        }
        try {
            const canEdit = (await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.procurement")) ||
                req.user.role === enums_1.UserRole.FINANCE ||
                req.user.role === enums_1.UserRole.SUPER_ADMIN;
            if (!canEdit)
                return res.status(403).json({ message: "Forbidden" });
            const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id, req.organization.id);
            if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            await prisma_1.prisma.purchaseOrderPayment.create({
                data: {
                    purchaseOrderId: existing.id,
                    amount,
                    paidDate: parsedDate,
                    reference: reference?.trim() || null,
                    notes: notes?.trim() || null,
                    createdById: req.user.id,
                },
            });
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: existing.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(201).json({ message: "Payment logged", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /purchase-orders/:id/payments/:paymentId — removes one logged payment. Same edit
     * permission as addPurchaseOrderPayment. */
    static deletePurchaseOrderPayment = async (req, res) => {
        const { id, paymentId } = req.params;
        try {
            const canEdit = (await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.procurement")) ||
                req.user.role === enums_1.UserRole.FINANCE ||
                req.user.role === enums_1.UserRole.SUPER_ADMIN;
            if (!canEdit)
                return res.status(403).json({ message: "Forbidden" });
            const loaded = await PurchaseOrderController.loadOwnedPurchaseOrderPayment(id, paymentId, req.organization.id);
            if (!loaded || !PurchaseOrderController.isVisibleTo(loaded.po, req)) {
                return res.status(404).json({ message: "Payment not found" });
            }
            await prisma_1.prisma.purchaseOrderPayment.delete({ where: { id: loaded.payment.id } });
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: loaded.po.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(200).json({ message: "Payment deleted", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /**
     * GET /purchase-orders/:id/pdf — renders the PO on demand and streams it back as an
     * attachment (forces a download rather than an inline view). Always regenerated live from
     * current data rather than any stored snapshot, so edits made afterward (HSN codes, shipping
     * terms, etc.) show up the next time someone downloads it.
     */
    static downloadPdf = async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id, req.organization.id);
            if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({ where: { id: existing.id }, include: PDF_INCLUDE });
            if (!purchaseOrder)
                return res.status(404).json({ message: "Purchase order not found" });
            // A missing/unreadable letterhead image shouldn't block PDF generation — the template
            // just falls back to a blank signature line.
            const loadOrgImage = async (key) => {
                if (!key)
                    return null;
                try {
                    return await (0, supabaseStorage_1.downloadFileFromStorage)(key);
                }
                catch (error) {
                    console.error(`Failed to load organization letterhead image "${key}":`, error);
                    return null;
                }
            };
            const [signatureImage, stampImage] = await Promise.all([
                loadOrgImage(purchaseOrder.organization?.signatureImagePath),
                loadOrgImage(purchaseOrder.organization?.stampImagePath),
            ]);
            const doc = (0, purchaseOrderPdf_1.buildPurchaseOrderPdf)({
                poNumber: purchaseOrder.poNumber,
                createdAt: purchaseOrder.createdAt,
                paymentTerms: purchaseOrder.paymentTerms,
                incoterms: purchaseOrder.incoterms,
                taxPercent: purchaseOrder.taxPercent,
                terms: purchaseOrder.terms,
                deliveryPeriod: purchaseOrder.deliveryPeriod,
                finalDestination: purchaseOrder.finalDestination,
                customerContactPerson: purchaseOrder.customerContactPerson,
                currency: purchaseOrder.currency,
                organizationName: purchaseOrder.organization?.name ?? null,
                organizationAddress: purchaseOrder.organization?.address ?? null,
                organizationContact: purchaseOrder.organization?.contact ?? null,
                organizationEmail: purchaseOrder.organization?.email ?? null,
                organizationWebsite: purchaseOrder.organization?.website ?? null,
                signatureImage,
                stampImage,
                vendor: purchaseOrder.vendor,
                items: purchaseOrder.items,
            });
            // poNumber can contain "/" (e.g. "1-83/84" — incremental number + Nepali fiscal year),
            // which isn't safe inside a Content-Disposition filename, so swap it for "-" there only.
            const downloadName = (purchaseOrder.poNumber || `PO-${purchaseOrder.id}`).replace(/\//g, "-");
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${downloadName}.pdf"`);
            doc.pipe(res);
            doc.end();
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /purchase-orders/:id/cost-sheet — spec section 9's landed-cost breakdown, always computed on the fly. */
    static getCostSheet = async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await PurchaseOrderController.loadOwnedPurchaseOrder(id, req.organization.id);
            if (!existing || !PurchaseOrderController.isVisibleTo(existing, req)) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            const costSheet = await (0, costSheet_1.computeCostSheet)(existing.id);
            return res.status(200).json({ costSheet });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.PurchaseOrderController = PurchaseOrderController;
//# sourceMappingURL=PurchaseOrderController.js.map