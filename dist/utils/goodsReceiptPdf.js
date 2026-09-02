"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGoodsReceiptPdf = buildGoodsReceiptPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic (same convention as purchaseOrderPdf.ts). */
const num = (value) => {
    if (value == null)
        return 0;
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    if (typeof value === "string")
        return Number(value) || 0;
    const n = value.toNumber();
    return Number.isFinite(n) ? n : 0;
};
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 45;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = "#000000";
const GRAY = "#555555";
const fmtDate = (d) => d.toLocaleDateString("en-US");
const fmtAmount = (n) => (n > 0 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--");
// Column widths sum to CONTENT_WIDTH (522).
const COLS = [
    { key: "no", label: "", width: 24, align: "center" },
    { key: "goods", label: "Goods", width: 148, align: "left" },
    { key: "pack", label: "Pack Size", width: 55, align: "center" },
    { key: "price", label: "Price", width: 55, align: "right" },
    { key: "order", label: "Order Quantity", width: 60, align: "right" },
    { key: "delivered", label: "Delivered Quantity", width: 68, align: "right" },
    { key: "comments", label: "Comments", width: 112, align: "left" },
];
/**
 * Renders a Goods Received Note as a PDF matching the classic GRN template shape: a bordered
 * "Goods Received Note" title bar, a two-line header of supplier/date/advice-note-number and
 * order-number/delivery-location/cost-centre, a numbered items table (Goods/Pack Size/Price/
 * Order Quantity/Delivered Quantity/Comments), a signature line, and the standard 3-copy
 * distribution footer. Uses plain built-in fonts (no custom letterhead branding) since this is
 * a functional warehouse/accounts document, not a customer-facing one like the PO PDF.
 */
function buildGoodsReceiptPdf(gr) {
    const doc = new pdfkit_1.default({ size: [PAGE_WIDTH, PAGE_HEIGHT], margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } });
    let y = MARGIN;
    // ---- Header line: org name (left) / GRN number (right) ----
    doc.font("Helvetica").fontSize(10).fillColor(BLACK);
    doc.text(gr.organizationName || "Goods Received Note", MARGIN, y, { width: CONTENT_WIDTH / 2 });
    doc.text(`GRN Number: ${gr.grnNumber || "--"}`, MARGIN, y, { width: CONTENT_WIDTH, align: "right" });
    y += 22;
    // ---- Title box ----
    const titleH = 34;
    doc.rect(MARGIN, y, CONTENT_WIDTH, titleH).lineWidth(1).stroke(BLACK);
    doc.font("Helvetica-Bold").fontSize(20).text("Goods Received Note", MARGIN, y + 8, { width: CONTENT_WIDTH, align: "center" });
    y += titleH + 20;
    // ---- Supplier / Date / Advice Note Number ----
    doc.font("Helvetica").fontSize(10);
    doc.text(`Supplier: ${gr.supplierName || "--"}     Date: ${fmtDate(gr.createdAt)}     Advice Note Number: ${gr.grnNumber || "--"}`, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 8;
    // ---- Order Number / Delivery Location / Cost-Centre ----
    doc.text(`Order Number: ${gr.poNumber || "--"}     Delivery Location: ${gr.deliveryLocation || "--"}     Cost-Centre: ${gr.costCentre || "--"}`, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 20;
    // ---- Items table ----
    const headerH = 30;
    let colX = MARGIN;
    doc.font("Helvetica-Bold").fontSize(9.5);
    for (const col of COLS) {
        doc.rect(colX, y, col.width, headerH).stroke(BLACK);
        if (col.label)
            doc.text(col.label, colX + 4, y + (headerH - 10) / 2, { width: col.width - 8, align: col.align });
        colX += col.width;
    }
    y += headerH;
    doc.font("Helvetica").fontSize(9.5);
    gr.items.forEach((item, i) => {
        const unitPrice = num(item.unitPrice);
        const goodsColWidth = COLS[1].width - 8;
        const commentsColWidth = COLS[6].width - 8;
        const comments = item.damagedQuantity > 0 ? `${item.damagedQuantity} damaged` : "";
        const goodsHeight = doc.heightOfString(item.itemName, { width: goodsColWidth });
        const commentsHeight = comments ? doc.heightOfString(comments, { width: commentsColWidth }) : 0;
        const rowH = Math.max(22, goodsHeight + 10, commentsHeight + 10);
        const values = {
            no: String(i + 1),
            goods: item.itemName,
            pack: item.unit || "--",
            price: fmtAmount(unitPrice),
            order: item.orderQuantity != null ? String(item.orderQuantity) : "--",
            delivered: String(item.deliveredQuantity),
            comments,
        };
        colX = MARGIN;
        for (const col of COLS) {
            doc.rect(colX, y, col.width, rowH).stroke(BLACK);
            const value = values[col.key] ?? "";
            if (value)
                doc.text(value, colX + 4, y + 6, { width: col.width - 8, align: col.align });
            colX += col.width;
        }
        y += rowH;
    });
    y += 30;
    // ---- Signature line ----
    if (y > PAGE_HEIGHT - 140) {
        doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } });
        y = MARGIN;
    }
    const sigColW = CONTENT_WIDTH / 2 - 10;
    doc.font("Helvetica").fontSize(10).fillColor(BLACK);
    doc.text(`Received by: ${gr.receivedBy || "________________________"}`, MARGIN, y, { width: sigColW });
    doc.text("Checked by: ________________________", MARGIN + sigColW + 20, y, { width: sigColW });
    y += 40;
    // ---- Distribution footer ----
    doc.font("Helvetica").fontSize(9.5).fillColor(GRAY);
    doc.text("1. Accounts/Finance dept. copy", MARGIN, y);
    y = doc.y + 2;
    doc.text("2. Supplier Copy", MARGIN, y);
    y = doc.y + 2;
    doc.text("3. Stores/Goods Inwards copy", MARGIN, y);
    return doc;
}
//# sourceMappingURL=goodsReceiptPdf.js.map