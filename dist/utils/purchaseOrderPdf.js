"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPurchaseOrderPdf = buildPurchaseOrderPdf;
exports.purchaseOrderPdfBuffer = purchaseOrderPdfBuffer;
const pdfkit_1 = __importDefault(require("pdfkit"));
const numberToWords_1 = require("./numberToWords");
/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic (same convention as costSheet.ts). */
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
const NAVY = "#16365c";
const LIGHT_BG = "#eef3fa";
const BORDER = "#c7d2e0";
const GRAY = "#64748b";
const TEXT = "#1e293b";
const MARGIN = 40;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const fmtDate = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "--");
const fmtAmount = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Fills a navy bar with white centered-ish label text — used for every section header in the template. */
function sectionBar(doc, x, y, width, height, label, fontSize = 9) {
    doc.rect(x, y, width, height).fill(NAVY);
    doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(fontSize)
        .text(label, x + 8, y + (height - fontSize) / 2, { width: width - 16 });
}
/** A bordered box with a small gray caption line and a value line beneath it — the template's "NAME / ADDRESS / PHONE" field style. */
function labeledField(doc, x, y, width, caption, value) {
    doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(7).text(caption.toUpperCase(), x, y, { width });
    const captionHeight = doc.heightOfString(caption, { width });
    doc
        .fillColor(TEXT)
        .font("Helvetica")
        .fontSize(9.5)
        .text(value || "--", x, y + captionHeight + 2, { width });
    return doc.y;
}
/**
 * Renders a Purchase Order as a PDF matching the company's standard PO template
 * (company letterhead, Vendor/Customer boxes, shipping terms, items table, amount
 * in words, payment terms + grand total, notes). Returns the document *before*
 * `.end()` is called — callers either `.pipe(res)` it for a live download or
 * collect it into a Buffer to save alongside the PO (see purchaseOrderPdfBuffer).
 */
function buildPurchaseOrderPdf(po) {
    const doc = new pdfkit_1.default({ size: "A4", margin: MARGIN });
    let y = MARGIN;
    // ---- Letterhead ----
    const companyName = po.organizationName || "Purchase Order";
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(17).text(companyName, MARGIN, y, { width: CONTENT_WIDTH * 0.62 });
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(19).text("PURCHASE ORDER", MARGIN, y + 2, { width: CONTENT_WIDTH, align: "right" });
    y = doc.y + 3;
    const letterheadLine = [po.organizationAddress, po.organizationContact, po.organizationEmail, po.organizationWebsite]
        .filter((v) => !!v && v.trim().length > 0)
        .join("  ·  ");
    if (letterheadLine) {
        doc.fillColor(GRAY).font("Helvetica").fontSize(8).text(letterheadLine, MARGIN, y, { width: CONTENT_WIDTH * 0.7 });
    }
    y = doc.y + 11;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor(NAVY).lineWidth(1.5).stroke();
    y += 10;
    // ---- P.O. Number / Date box, right-aligned ----
    const metaW = 220;
    const metaX = MARGIN + CONTENT_WIDTH - metaW;
    sectionBar(doc, metaX, y, metaW / 2, 16, "P.O. NUMBER", 7.5);
    sectionBar(doc, metaX + metaW / 2, y, metaW / 2, 16, "DATE", 7.5);
    doc
        .rect(metaX, y + 16, metaW / 2, 18)
        .stroke(BORDER)
        .rect(metaX + metaW / 2, y + 16, metaW / 2, 18)
        .stroke(BORDER);
    doc
        .fillColor(TEXT)
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .text(po.poNumber || "--", metaX + 6, y + 21, { width: metaW / 2 - 12 })
        .text(fmtDate(po.createdAt), metaX + metaW / 2 + 6, y + 21, { width: metaW / 2 - 12 });
    y += 16 + 18 + 14;
    // ---- Vendor / Customer ----
    const colGap = 12;
    const colW = (CONTENT_WIDTH - colGap) / 2;
    const vendorX = MARGIN;
    const customerX = MARGIN + colW + colGap;
    sectionBar(doc, vendorX, y, colW, 16, "VENDOR");
    sectionBar(doc, customerX, y, colW, 16, "CUSTOMER");
    let fieldY = y + 16 + 8;
    const vendor = po.vendor;
    const vendorFields = [
        ["Name", vendor?.contactPerson || vendor?.name || "--"],
        ["Company Name", vendor?.name || "--"],
        ["Address", vendor?.address || vendor?.location || "--"],
        ["Phone", vendor?.contact || "--"],
        ["Email Address", vendor?.email || "--"],
    ];
    const customerFields = [
        ["Name", companyName],
        ["Company Name", companyName],
        ["Address", po.deliveryAddress || po.organizationAddress || "--"],
        ["Phone", po.organizationContact || "--"],
        ["Email Address", po.organizationEmail || "--"],
    ];
    let vendorY = fieldY;
    let customerY = fieldY;
    for (let i = 0; i < vendorFields.length; i++) {
        const [vLabel, vValue] = vendorFields[i];
        const [cLabel, cValue] = customerFields[i];
        vendorY = labeledField(doc, vendorX, vendorY, colW, vLabel, vValue) + 8;
        customerY = labeledField(doc, customerX, customerY, colW, cLabel, cValue) + 8;
    }
    y = Math.max(vendorY, customerY) + 4;
    // ---- Shipping Terms / Delivery Period / Final Destination ----
    const triW = (CONTENT_WIDTH - colGap * 2) / 3;
    const triLabels = ["SHIPPING TERMS", "DELIVERY PERIOD", "FINAL DESTINATION"];
    const triValues = [po.shippingTerms || "--", po.deliveryPeriod || "--", po.finalDestination || "--"];
    for (let i = 0; i < 3; i++) {
        const x = MARGIN + i * (triW + colGap);
        sectionBar(doc, x, y, triW, 16, triLabels[i], 7.5);
    }
    const triTextY = y + 16 + 6;
    let maxTriHeight = 0;
    for (let i = 0; i < 3; i++) {
        const x = MARGIN + i * (triW + colGap);
        const value = triValues[i];
        doc.fillColor(TEXT).font("Helvetica").fontSize(9).text(value, x, triTextY, { width: triW });
        maxTriHeight = Math.max(maxTriHeight, doc.heightOfString(value, { width: triW }));
    }
    y = triTextY + maxTriHeight + 14;
    // ---- Items table ----
    // Unit goes in the Quantity header (matching the original template) rather than
    // appended to each row's description, when every item shares one common unit.
    const itemUnits = new Set(po.items.map((i) => (i.unit || "").trim()).filter((u) => u.length > 0));
    const commonUnit = itemUnits.size === 1 ? [...itemUnits][0] : null;
    const quantityLabel = commonUnit ? `Quantity (${commonUnit})` : "Quantity";
    const cols = [
        { label: "HSN Code", width: 60 },
        { label: "Product Description", width: 210 },
        { label: quantityLabel, width: 70, align: "right" },
        { label: "Unit Price", width: 80, align: "right" },
        { label: "Amount", width: CONTENT_WIDTH - 60 - 210 - 70 - 80, align: "right" },
    ];
    let colX = MARGIN;
    const headerH = 20;
    for (const col of cols) {
        doc.rect(colX, y, col.width, headerH).fill(NAVY);
        doc
            .fillColor("#ffffff")
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .text(col.label, colX + 5, y + 6, { width: col.width - 10, align: col.align || "left" });
        colX += col.width;
    }
    y += headerH;
    let grandTotal = 0;
    for (const item of po.items) {
        const unitPrice = num(item.unitPrice);
        const amount = unitPrice * item.quantity;
        grandTotal += amount;
        const rowUnit = (item.unit || "").trim();
        const rowQuantity = commonUnit ? String(item.quantity) : rowUnit ? `${item.quantity} ${rowUnit}` : String(item.quantity);
        const rowValues = [
            item.hsnCode || "--",
            item.itemName,
            rowQuantity,
            fmtAmount(unitPrice),
            fmtAmount(amount),
        ];
        const rowHeight = Math.max(18, ...cols.map((col, i) => doc.heightOfString(rowValues[i], { width: col.width - 10 }) + 8));
        colX = MARGIN;
        for (let i = 0; i < cols.length; i++) {
            const col = cols[i];
            doc.rect(colX, y, col.width, rowHeight).stroke(BORDER);
            doc
                .fillColor(TEXT)
                .font("Helvetica")
                .fontSize(9)
                .text(rowValues[i], colX + 5, y + 5, { width: col.width - 10, align: col.align || "left" });
            colX += col.width;
        }
        y += rowHeight;
    }
    // Totals row
    const lastCol = cols[cols.length - 1];
    const totalsLabelWidth = cols.slice(0, cols.length - 1).reduce((s, c) => s + c.width, 0);
    doc.rect(MARGIN, y, totalsLabelWidth, 20).fill(LIGHT_BG);
    doc.rect(MARGIN + totalsLabelWidth, y, lastCol.width, 20).fill(LIGHT_BG);
    doc
        .fillColor(TEXT)
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .text("Total", MARGIN, y + 5, { width: totalsLabelWidth - 10, align: "right" })
        .text(fmtAmount(grandTotal), MARGIN + totalsLabelWidth, y + 5, { width: lastCol.width - 10, align: "right" });
    y += 20 + 6;
    // ---- Amount in words ----
    const amountWordsText = `Amount in Words: ${(0, numberToWords_1.amountToWords)(grandTotal)}.`;
    const amountWordsHeight = doc.heightOfString(amountWordsText, { width: CONTENT_WIDTH - 16 }) + 12;
    doc.rect(MARGIN, y, CONTENT_WIDTH, amountWordsHeight).fill(NAVY);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(amountWordsText, MARGIN + 8, y + 6, { width: CONTENT_WIDTH - 16 });
    y += amountWordsHeight + 12;
    // ---- Payment Terms (left) / Grand Total box (right) ----
    const leftW = CONTENT_WIDTH * 0.62;
    const rightW = CONTENT_WIDTH - leftW - colGap;
    const rightX = MARGIN + leftW + colGap;
    doc.rect(rightX, y, rightW, 24).stroke(BORDER);
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9).text("GRAND TOTAL", rightX + 6, y + 7, { width: rightW * 0.5 });
    doc.font("Helvetica-Bold").fontSize(10).text(fmtAmount(grandTotal), rightX + rightW * 0.5, y + 7, { width: rightW * 0.5 - 6, align: "right" });
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9).text("Payment Terms:", MARGIN, y);
    const paymentTermsY = doc.y + 2;
    doc.font("Helvetica").fontSize(9).text(po.paymentTerms || "--", MARGIN, paymentTermsY, { width: leftW });
    let leftY = doc.y + 10;
    if (po.incoterms) {
        doc.font("Helvetica-Bold").fontSize(9).text("Incoterms:", MARGIN, leftY, { continued: true }).font("Helvetica").text(` ${po.incoterms}`);
        leftY = doc.y + 6;
    }
    if (po.taxPercent != null && num(po.taxPercent) > 0) {
        doc.font("Helvetica-Bold").fontSize(9).text("Tax:", MARGIN, leftY, { continued: true }).font("Helvetica").text(` ${num(po.taxPercent)}%`);
        leftY = doc.y + 6;
    }
    y = Math.max(leftY, y + 24) + 10;
    if (po.terms) {
        doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9).text("Notes:", MARGIN, y);
        y = doc.y + 2;
        doc.font("Helvetica").fontSize(8.5).text(po.terms, MARGIN, y, { width: CONTENT_WIDTH });
        y = doc.y + 16;
    }
    // ---- Signature ----
    const sigY = Math.max(y, doc.page.height - 100);
    doc.moveTo(MARGIN + CONTENT_WIDTH - 180, sigY).lineTo(MARGIN + CONTENT_WIDTH, sigY).strokeColor(BORDER).lineWidth(1).stroke();
    doc
        .fillColor(GRAY)
        .font("Helvetica")
        .fontSize(8.5)
        .text("Authorized Signatory", MARGIN + CONTENT_WIDTH - 180, sigY + 4, { width: 180, align: "center" });
    return doc;
}
/** Renders the PDF fully in memory and resolves with the finished bytes — used when the file needs to be written to disk (see PurchaseRequestController.generatePurchaseOrder). For a live HTTP download, prefer `buildPurchaseOrderPdf(po).pipe(res)` directly to avoid buffering. */
function purchaseOrderPdfBuffer(po) {
    return new Promise((resolve, reject) => {
        try {
            const doc = buildPurchaseOrderPdf(po);
            const chunks = [];
            doc.on("data", (chunk) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);
            doc.end();
        }
        catch (err) {
            reject(err);
        }
    });
}
//# sourceMappingURL=purchaseOrderPdf.js.map