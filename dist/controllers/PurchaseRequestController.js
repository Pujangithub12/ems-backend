"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseRequestController = void 0;
const prisma_1 = require("../config/prisma");
const permissionService_1 = require("../utils/permissionService");
/** Transitions that require the "projects.procurement" permission (i.e. an approver, not just the requester) — draft->submitted is the one transition any requester can make on their own request. */
const APPROVAL_STATUSES = new Set(["approved", "rejected"]);
const DETAIL_INCLUDE = {
    project: true,
    requestedBy: true,
    items: { include: { item: true } },
    vendorQuotes: { include: { vendor: true }, orderBy: { createdAt: "asc" } },
    purchaseOrder: true,
};
/** Only these manual transitions are allowed via POST /purchase-requests/:id/status — "converted_to_po" is a side effect of generate-po, never set directly. */
const ALLOWED_STATUS_TRANSITIONS = {
    draft: ["submitted"],
    submitted: ["approved", "rejected"],
};
/** Resolves item-name/catalog-item pairs shared by create and update — prefers the catalog reference when given. */
async function resolveItemInputs(rawItems, organizationId) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error("At least one item is required");
    }
    const resolved = [];
    for (const raw of rawItems) {
        let catalogItem = null;
        if (raw.itemId) {
            catalogItem = await prisma_1.prisma.catalogItem.findFirst({ where: { id: raw.itemId, organizationId } });
            if (!catalogItem)
                throw new Error("Selected item not found");
        }
        const itemName = catalogItem ? catalogItem.name : typeof raw.itemName === "string" ? raw.itemName.trim() : "";
        if (!itemName)
            throw new Error("Item name is required for every line item");
        resolved.push({
            itemName,
            itemId: catalogItem?.id ?? null,
            quantity: raw.quantity && raw.quantity > 0 ? Math.round(raw.quantity) : 1,
            unit: raw.unit ?? null,
            estimatedPrice: raw.estimatedPrice ?? null,
            notes: raw.notes ?? null,
        });
    }
    return resolved;
}
/** Purchase Request tab (procurement pipeline v2, step 1): PR -> Vendor Selection -> generate-po. */
class PurchaseRequestController {
    /** GET /workspace/purchase-requests — aggregated across every project in the organization. */
    static getOrganizationPurchaseRequests = async (req, res) => {
        try {
            const requests = await prisma_1.prisma.purchaseRequest.findMany({
                where: { organizationId: req.organization.id },
                include: DETAIL_INCLUDE,
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json({ requests });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /projects/:projectId/purchase-requests — flat list for the project-scoped tab. */
    static getPurchaseRequests = async (req, res) => {
        const { projectId } = req.params;
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: { id: parseInt(projectId), organizationId: req.organization.id },
            });
            if (!project)
                return res.status(404).json({ message: "Project not found" });
            const requests = await prisma_1.prisma.purchaseRequest.findMany({
                where: { projectId: project.id },
                include: DETAIL_INCLUDE,
                orderBy: { createdAt: "desc" },
            });
            return res.status(200).json({ requests });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /projects/:projectId/purchase-requests — creates a draft PR with its line items. Open to any authenticated organization member (see routes.ts). */
    static addPurchaseRequest = async (req, res) => {
        const { projectId } = req.params;
        const { department, priority, reason, items } = req.body;
        try {
            const project = await prisma_1.prisma.project.findFirst({
                where: { id: parseInt(projectId), organizationId: req.organization.id },
            });
            if (!project)
                return res.status(404).json({ message: "Project not found" });
            let resolvedItems;
            try {
                resolvedItems = await resolveItemInputs(items, req.organization.id);
            }
            catch (validationError) {
                return res.status(400).json({ message: validationError.message });
            }
            const requestedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const created = await prisma_1.prisma.purchaseRequest.create({
                data: {
                    projectId: project.id,
                    organizationId: req.organization.id,
                    status: "draft",
                    ...(department ? { department } : {}),
                    ...(priority ? { priority } : {}),
                    ...(reason ? { reason } : {}),
                    ...(requestedBy ? { requestedById: requestedBy.id } : {}),
                    items: { create: resolvedItems },
                },
            });
            const prNumber = `PR-${String(created.id).padStart(6, "0")}`;
            await prisma_1.prisma.purchaseRequest.update({ where: { id: created.id }, data: { prNumber } });
            await prisma_1.prisma.purchaseRequestStatusHistory.create({
                data: {
                    toStatus: "draft",
                    purchaseRequestId: created.id,
                    ...(requestedBy ? { changedById: requestedBy.id } : {}),
                },
            });
            const purchaseRequest = await prisma_1.prisma.purchaseRequest.findUnique({
                where: { id: created.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(201).json({ message: "Purchase request created", purchaseRequest });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    static async loadOwnedRequest(id, organizationId) {
        const purchaseRequest = await prisma_1.prisma.purchaseRequest.findFirst({
            where: { id: parseInt(id) },
            include: DETAIL_INCLUDE,
        });
        if (!purchaseRequest || purchaseRequest.organizationId !== organizationId)
            return null;
        return purchaseRequest;
    }
    /** PUT /purchase-requests/:id — only while status is "draft". Open to any authenticated organization member. */
    static updatePurchaseRequest = async (req, res) => {
        const { id } = req.params;
        const { department, priority, reason, items } = req.body;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            if (existing.status !== "draft") {
                return res.status(400).json({ message: "Only draft requests can be edited" });
            }
            const data = {};
            if (department !== undefined)
                data.department = department;
            if (priority !== undefined)
                data.priority = priority;
            if (reason !== undefined)
                data.reason = reason;
            if (items !== undefined) {
                let resolvedItems;
                try {
                    resolvedItems = await resolveItemInputs(items, req.organization.id);
                }
                catch (validationError) {
                    return res.status(400).json({ message: validationError.message });
                }
                // Full-replace the line items, matching the codebase's existing full-replace convention for Schedule/Hierarchy.
                await prisma_1.prisma.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: existing.id } });
                data.items = { create: resolvedItems };
            }
            await prisma_1.prisma.purchaseRequest.update({ where: { id: existing.id }, data });
            const purchaseRequest = await prisma_1.prisma.purchaseRequest.findUnique({
                where: { id: existing.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(200).json({ message: "Purchase request updated", purchaseRequest });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /purchase-requests/:id — only while status is "draft" (submitted/approved/converted requests are kept for audit trail). Open to any authenticated organization member. */
    static deletePurchaseRequest = async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            if (existing.status !== "draft") {
                return res.status(400).json({ message: "Only draft requests can be deleted" });
            }
            await prisma_1.prisma.purchaseRequest.delete({ where: { id: existing.id } });
            return res.status(200).json({ message: "Purchase request deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /**
     * POST /purchase-requests/:id/status — draft->submitted->approved/rejected. Any authenticated
     * organization member may submit their own draft; moving a submitted request to approved/rejected
     * requires the "projects.procurement" permission (route itself is open — see routes.ts).
     */
    static changeStatus = async (req, res) => {
        const { id } = req.params;
        const { status, notes } = req.body;
        try {
            if (APPROVAL_STATUSES.has(status)) {
                const allowed = await (0, permissionService_1.roleHasPermission)(req.user.role, "projects.procurement");
                if (!allowed) {
                    return res.status(403).json({ message: "Forbidden: Access denied" });
                }
            }
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[existing.status] ?? [];
            if (!allowedNextStatuses.includes(status)) {
                return res.status(400).json({
                    message: `Cannot move a ${existing.status} request to ${status}`,
                });
            }
            await prisma_1.prisma.purchaseRequest.update({ where: { id: existing.id }, data: { status } });
            const changedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            await prisma_1.prisma.purchaseRequestStatusHistory.create({
                data: {
                    fromStatus: existing.status,
                    toStatus: status,
                    purchaseRequestId: existing.id,
                    ...(notes ? { notes } : {}),
                    ...(changedBy ? { changedById: changedBy.id } : {}),
                },
            });
            const purchaseRequest = await prisma_1.prisma.purchaseRequest.findUnique({
                where: { id: existing.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(200).json({ message: "Status updated", purchaseRequest });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /purchase-requests/:id/vendor-quotes — add a "possible vendor" option. Admin-gated. */
    static addVendorQuote = async (req, res) => {
        const { id } = req.params;
        const { vendorId, price, notes } = req.body;
        if (!vendorId || price === undefined || price === null) {
            return res.status(400).json({ message: "vendorId and price are required" });
        }
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const vendor = await prisma_1.prisma.vendor.findFirst({
                where: { id: vendorId, organizationId: req.organization.id },
            });
            if (!vendor)
                return res.status(400).json({ message: "Vendor not found" });
            const quote = await prisma_1.prisma.vendorQuote.create({
                data: {
                    purchaseRequestId: existing.id,
                    vendorId: vendor.id,
                    price,
                    ...(notes ? { notes } : {}),
                },
                include: { vendor: true },
            });
            return res.status(201).json({ message: "Vendor quote added", quote });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** PUT /purchase-requests/:id/vendor-quotes/:quoteId — admin-gated. */
    static updateVendorQuote = async (req, res) => {
        const { id, quoteId } = req.params;
        const { vendorId, price, notes } = req.body;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const quote = await prisma_1.prisma.vendorQuote.findFirst({
                where: { id: parseInt(quoteId), purchaseRequestId: existing.id },
            });
            if (!quote)
                return res.status(404).json({ message: "Vendor quote not found" });
            const data = {};
            if (price !== undefined)
                data.price = price;
            if (notes !== undefined)
                data.notes = notes;
            if (vendorId !== undefined) {
                const vendor = await prisma_1.prisma.vendor.findFirst({
                    where: { id: vendorId, organizationId: req.organization.id },
                });
                if (!vendor)
                    return res.status(400).json({ message: "Vendor not found" });
                data.vendorId = vendor.id;
            }
            const updated = await prisma_1.prisma.vendorQuote.update({
                where: { id: quote.id },
                data,
                include: { vendor: true },
            });
            return res.status(200).json({ message: "Vendor quote updated", quote: updated });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /purchase-requests/:id/vendor-quotes/:quoteId — admin-gated. */
    static deleteVendorQuote = async (req, res) => {
        const { id, quoteId } = req.params;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const quote = await prisma_1.prisma.vendorQuote.findFirst({
                where: { id: parseInt(quoteId), purchaseRequestId: existing.id },
            });
            if (!quote)
                return res.status(404).json({ message: "Vendor quote not found" });
            await prisma_1.prisma.vendorQuote.delete({ where: { id: quote.id } });
            return res.status(200).json({ message: "Vendor quote deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /purchase-requests/:id/vendor-quotes/:quoteId/select — marks this quote selected, unmarks every other quote on the same PR. Admin-gated. */
    static selectVendorQuote = async (req, res) => {
        const { id, quoteId } = req.params;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const quote = await prisma_1.prisma.vendorQuote.findFirst({
                where: { id: parseInt(quoteId), purchaseRequestId: existing.id },
            });
            if (!quote)
                return res.status(404).json({ message: "Vendor quote not found" });
            await prisma_1.prisma.$transaction([
                prisma_1.prisma.vendorQuote.updateMany({
                    where: { purchaseRequestId: existing.id },
                    data: { isSelected: false },
                }),
                prisma_1.prisma.vendorQuote.update({ where: { id: quote.id }, data: { isSelected: true } }),
            ]);
            const purchaseRequest = await prisma_1.prisma.purchaseRequest.findUnique({
                where: { id: existing.id },
                include: DETAIL_INCLUDE,
            });
            return res.status(200).json({ message: "Vendor selected", purchaseRequest });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /**
     * POST /purchase-requests/:id/generate-po — the "Generate Purchase Order" action from the
     * Vendor Selection screen. Requires an approved PR with exactly one selected vendor quote and
     * no existing PO. Snapshots the PR's line items onto the new PO (not a live reference) so the
     * PO stays stable if the PR is edited later. Admin-gated.
     */
    static generatePurchaseOrder = async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            if (existing.status !== "approved") {
                return res.status(400).json({ message: "Purchase request must be approved before generating a purchase order" });
            }
            if (existing.purchaseOrder) {
                return res.status(400).json({ message: "A purchase order has already been generated for this request" });
            }
            const selectedQuote = existing.vendorQuotes.find((quote) => quote.isSelected);
            if (!selectedQuote) {
                return res.status(400).json({ message: "Select a vendor before generating a purchase order" });
            }
            const createdPo = await prisma_1.prisma.purchaseOrder.create({
                data: {
                    purchaseRequestId: existing.id,
                    vendorId: selectedQuote.vendorId,
                    projectId: existing.projectId,
                    organizationId: req.organization.id,
                    status: "created",
                    items: {
                        // The selected vendor quote's price is a single figure for the whole PR (one
                        // vendor per PR, per the vendor-selection design) rather than a per-line-item
                        // price, so each PO line item's unitPrice falls back to that item's own
                        // estimatedPrice from the PR — the closest per-item cost signal available.
                        create: existing.items.map((item) => ({
                            itemName: item.itemName,
                            itemId: item.itemId,
                            quantity: item.quantity,
                            unit: item.unit,
                            unitPrice: item.estimatedPrice,
                            notes: item.notes,
                        })),
                    },
                },
            });
            const poNumber = `PO-${String(createdPo.id).padStart(6, "0")}`;
            await prisma_1.prisma.purchaseOrder.update({ where: { id: createdPo.id }, data: { poNumber } });
            const changedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            await prisma_1.prisma.purchaseOrderStatusHistory.create({
                data: {
                    toStatus: "created",
                    purchaseOrderId: createdPo.id,
                    ...(changedBy ? { changedById: changedBy.id } : {}),
                },
            });
            await prisma_1.prisma.purchaseRequest.update({ where: { id: existing.id }, data: { status: "converted_to_po" } });
            await prisma_1.prisma.purchaseRequestStatusHistory.create({
                data: {
                    fromStatus: "approved",
                    toStatus: "converted_to_po",
                    purchaseRequestId: existing.id,
                    ...(changedBy ? { changedById: changedBy.id } : {}),
                },
            });
            const purchaseOrder = await prisma_1.prisma.purchaseOrder.findUnique({
                where: { id: createdPo.id },
                include: { vendor: true, project: true, items: true, purchaseRequest: true },
            });
            // No PDF is generated here anymore — at this point most of what the PDF
            // needs (delivery address, payment terms, incoterms, shipping terms,
            // etc.) hasn't been filled in yet on the new PO, so an eagerly-rendered
            // snapshot would just be mostly blank. GET /purchase-orders/:id/pdf
            // renders it on demand, live from whatever's actually been filled in by
            // then — that's the only way a PO PDF gets created now.
            return res.status(201).json({ message: "Purchase order generated", purchaseOrder });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** POST /purchase-requests/:itemId/attachments — upload a document (general/quotation/comparison_sheet). Admin-gated. Expects multer single("file") + body.documentType; route uses :itemId because uploadPurchaseRequestFile's multer destination reads req.params.itemId. */
    static addAttachment = async (req, res) => {
        const { itemId } = req.params;
        const file = req.file;
        if (!file)
            return res.status(400).json({ message: "A file is required" });
        const documentType = req.body?.documentType || "general";
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(itemId, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const uploadedBy = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
            const attachment = await prisma_1.prisma.purchaseRequestAttachment.create({
                data: {
                    fileName: file.originalname,
                    filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
                    documentType,
                    purchaseRequestId: existing.id,
                    ...(uploadedBy ? { uploadedById: uploadedBy.id } : {}),
                },
            });
            return res.status(201).json({ message: "Attachment uploaded", attachment });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** DELETE /purchase-requests/:itemId/attachments/:attachmentId — admin-gated. */
    static deleteAttachment = async (req, res) => {
        const { itemId, attachmentId } = req.params;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(itemId, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const attachment = await prisma_1.prisma.purchaseRequestAttachment.findFirst({
                where: { id: parseInt(attachmentId), purchaseRequestId: existing.id },
            });
            if (!attachment)
                return res.status(404).json({ message: "Attachment not found" });
            await prisma_1.prisma.purchaseRequestAttachment.delete({ where: { id: attachment.id } });
            return res.status(200).json({ message: "Attachment deleted" });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /** GET /purchase-requests/:id/detail — everything the Vendor Selection / PR detail screen needs. */
    static getPurchaseRequestDetail = async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await PurchaseRequestController.loadOwnedRequest(id, req.organization.id);
            if (!existing)
                return res.status(404).json({ message: "Purchase request not found" });
            const [statusHistory, attachments] = await Promise.all([
                prisma_1.prisma.purchaseRequestStatusHistory.findMany({
                    where: { purchaseRequestId: existing.id },
                    include: { changedBy: true },
                    orderBy: { createdAt: "desc" },
                }),
                prisma_1.prisma.purchaseRequestAttachment.findMany({
                    where: { purchaseRequestId: existing.id },
                    include: { uploadedBy: true },
                    orderBy: { createdAt: "desc" },
                }),
            ]);
            return res.status(200).json({ purchaseRequest: existing, statusHistory, attachments });
        }
        catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
exports.PurchaseRequestController = PurchaseRequestController;
//# sourceMappingURL=PurchaseRequestController.js.map