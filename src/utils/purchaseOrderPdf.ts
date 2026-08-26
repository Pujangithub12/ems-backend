import PDFDocument from "pdfkit";
import { amountToWords } from "./numberToWords";

/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic (same convention as costSheet.ts). */
const num = (value: { toNumber(): number } | number | string | null | undefined): number => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
};

export interface PurchaseOrderPdfItem {
  itemName: string;
  quantity: number;
  unit?: string | null;
  unitPrice?: { toNumber(): number } | number | string | null;
  hsnCode?: string | null;
  /** The linked catalog item's description (Items page) — shown under the item name in the Product Description cell. */
  description?: string | null;
}

export interface PurchaseOrderPdfVendor {
  name: string;
  contactPerson?: string | null;
  address?: string | null;
  location?: string | null;
  contact?: string | null;
  email?: string | null;
}

export interface PurchaseOrderPdfData {
  poNumber?: string | null;
  createdAt: Date;
  paymentTerms?: string | null;
  /** Also displayed in the PDF's "SHIPPING TERMS" box (see triValues below) — there's no separate shippingTerms field. */
  incoterms?: string | null;
  taxPercent?: { toNumber(): number } | number | string | null;
  terms?: string | null;
  deliveryPeriod?: string | null;
  finalDestination?: string | null;
  /** Contact person name for the PDF's CUSTOMER box — the buying organization's own contact, distinct from the vendor's contactPerson. */
  customerContactPerson?: string | null;
  /** Currency label for the "Amount in Words" line (e.g. "Indian Rupees", "US Dollar") — falls back to "Rupees" when unset. */
  currency?: string | null;
  organizationName?: string | null;
  /** The buying organization's own letterhead details ("CUSTOMER" box + header subtitle) — from Organization.address/contact/email/website. */
  organizationAddress?: string | null;
  organizationContact?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  /** The organization's uploaded letterhead signature/stamp images (Settings > Organization
   * tab), drawn into the signature block — null/undefined falls back to a blank signature
   * line labeled "Authorized Signatory". */
  signatureImage?: Buffer | null;
  stampImage?: Buffer | null;
  vendor?: PurchaseOrderPdfVendor | null;
  items: PurchaseOrderPdfItem[];
}

// ---- Colors, lifted directly from the reference template's docx (three distinct navy
// tones are intentional — the badge, the "Product Details" label, and everything else
// each use their own slightly different shade in the source document). ----
const NAVY = "#1B3E6B";
const BADGE_NAVY = "#234061";
const PRODUCT_LABEL_NAVY = "#1F487C";
const LIGHT_BG = "#DCE6F0";
const BLACK = "#000000";
const SIGNATURE_GRAY = "#545454";

// US Letter, matching the reference template's page setup exactly (not A4).
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_TOP = 40;
const MARGIN_RIGHT = 54;
const MARGIN_BOTTOM = 14;
const MARGIN_LEFT = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Fonts: Caladea (metric-compatible Cambria substitute) for the company name only, matching
// the docx's majorHAnsi theme heading font; Carlito (metric-compatible Calibri substitute)
// for everything else, matching the docx's minorHAnsi default body font. Both are OFL-licensed
// npm packages (@fontsource/caladea, @fontsource/carlito) rather than the real Cambria/Calibri,
// which aren't redistributable.
const FONT_COMPANY = "Company";
const FONT_BODY = "Body";
const FONT_BODY_BOLD = "Body-Bold";
const FONT_BODY_BOLD_ITALIC = "Body-BoldItalic";
// .woff (not .woff2) specifically — fontkit's TTF subsetter throws "Offset is outside the
// bounds of the DataView" on these packages' .woff2 builds; the .woff builds embed cleanly.
const FONT_COMPANY_PATH = require.resolve("@fontsource/caladea/files/caladea-latin-700-normal.woff");
const FONT_BODY_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-400-normal.woff");
const FONT_BODY_BOLD_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-700-normal.woff");
const FONT_BODY_BOLD_ITALIC_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-700-italic.woff");

const fmtDate = (d?: Date | null) => (d ? d.toLocaleDateString("en-US") : "--");
const fmtAmount = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Fills a navy bar with white bold label text — used for every full-width section header. */
function sectionBar(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, label: string, fontSize = 11) {
  doc.rect(x, y, width, height).fill(NAVY);
  doc
    .fillColor("#ffffff")
    .font(FONT_COMPANY)
    .fontSize(fontSize)
    .text(label, x + 6, y + (height - fontSize) / 2, { width: width - 12 });
}

/** A bold black caption line with a plain black value line beneath it — the template's
 * "NAME OF CONTACT PERSON / COMPANY NAME / ADDRESS / PHONE / EMAIL ADDRESS" field style. */
function labeledField(doc: PDFKit.PDFDocument, x: number, y: number, width: number, caption: string, value: string) {
  doc.fillColor(BLACK).font(FONT_COMPANY).fontSize(9).text(caption, x, y, { width });
  const captionHeight = doc.heightOfString(caption, { width });
  doc
    .fillColor(BLACK)
    .font(FONT_BODY)
    .fontSize(9.5)
    .text(value || "--", x, y + captionHeight + 2, { width });
  return doc.y;
}

/**
 * Renders a Purchase Order as a PDF matching the company's reference Word template exactly:
 * same page size (US Letter), same three navy tones, same Cambria-style company name font
 * with Calibri-style body font, same column proportions for the Vendor/Customer and item
 * tables, and the same signature/stamp images. Returns the document *before* `.end()` is
 * called — callers either `.pipe(res)` it for a live download or collect it into a Buffer to
 * save alongside the PO (see purchaseOrderPdfBuffer).
 */
export function buildPurchaseOrderPdf(po: PurchaseOrderPdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margins: { top: MARGIN_TOP, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT } });
  doc.registerFont(FONT_COMPANY, FONT_COMPANY_PATH);
  doc.registerFont(FONT_BODY, FONT_BODY_PATH);
  doc.registerFont(FONT_BODY_BOLD, FONT_BODY_BOLD_PATH);
  doc.registerFont(FONT_BODY_BOLD_ITALIC, FONT_BODY_BOLD_ITALIC_PATH);
  let y = MARGIN_TOP;

  // ---- Letterhead: company name (Caladea/Cambria) + PURCHASE ORDER badge, adjacent
  // (one 2-column table in the source, ratio 6797:2815) ----
  const companyName = po.organizationName || "Purchase Order";
  const nameBlockW = (CONTENT_WIDTH * 6797) / 9612;
  const badgeW = CONTENT_WIDTH - nameBlockW;
  const badgeX = MARGIN_LEFT + nameBlockW;
  const badgeH = 62;

  doc
    .fillColor(NAVY)
    .font(FONT_COMPANY)
    .fontSize(24)
    .text(companyName, MARGIN_LEFT, y + 6, { width: nameBlockW - 8 });
  const nameBottom = doc.y;

  doc.rect(badgeX, y, badgeW, badgeH).fill(BADGE_NAVY);
  doc
    .fillColor("#ffffff")
    .font(FONT_BODY_BOLD)
    .fontSize(16)
    .text("PURCHASE ORDER", badgeX, y + 20, { width: badgeW, align: "center" });
  const badgeBottom = y + badgeH;

  // The company name (left column) and the badge (right column) don't share a height — a
  // short org name shouldn't push the address line down to match the badge's fixed height.
  // Track each column's own cursor and only reconverge once both are done.
  let leftY = nameBottom + 8;
  let rightY = badgeBottom + 8;

  const letterheadLine = [po.organizationAddress, po.organizationContact]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(" | ");
  if (letterheadLine) {
    doc.fillColor(NAVY).font(FONT_BODY_BOLD).fontSize(9).text(letterheadLine, MARGIN_LEFT, leftY, { width: CONTENT_WIDTH * 0.7 });
    leftY = doc.y;
  }
  leftY += 8;

  // ---- P.O. Number / Date box, aligned under the PURCHASE ORDER badge ----
  const metaW = badgeW;
  const metaX = badgeX;
  sectionBar(doc, metaX, rightY, metaW / 2, 16, "P.O. NUMBER", 7.5);
  sectionBar(doc, metaX + metaW / 2, rightY, metaW / 2, 16, "DATE", 7.5);
  doc
    .rect(metaX, rightY + 16, metaW / 2, 18)
    .stroke(LIGHT_BG)
    .rect(metaX + metaW / 2, rightY + 16, metaW / 2, 18)
    .stroke(LIGHT_BG);
  doc
    .fillColor(BLACK)
    .font(FONT_BODY_BOLD)
    .fontSize(9.5)
    .text(po.poNumber || "--", metaX + 6, rightY + 21, { width: metaW / 2 - 12 })
    .text(fmtDate(po.createdAt), metaX + metaW / 2 + 6, rightY + 21, { width: metaW / 2 - 12 });
  rightY += 16 + 18 + 14;

  y = Math.max(leftY, rightY);

  // ---- Vendor / Customer, one table (ratio 5625:4019, adjacent — no gap) ----
  const vendorW = (CONTENT_WIDTH * 5625) / 9644;
  const customerW = CONTENT_WIDTH - vendorW;
  const vendorX = MARGIN_LEFT;
  const customerX = MARGIN_LEFT + vendorW;

  sectionBar(doc, vendorX, y, vendorW, 16, "VENDOR");
  sectionBar(doc, customerX, y, customerW, 16, "CUSTOMER");
  const fieldsTop = y + 16;
  const fieldY = fieldsTop + 8;

  const vendor = po.vendor;
  const vendorFields: [string, string][] = [
    ["NAME OF CONTACT PERSON", vendor?.contactPerson || "--"],
    ["COMPANY NAME", vendor?.name || "--"],
    ["ADDRESS", vendor?.address || vendor?.location || "--"],
    ["PHONE", vendor?.contact || "--"],
    ["EMAIL ADDRESS", vendor?.email || "--"],
  ];
  const customerFields: [string, string][] = [
    ["NAME OF CONTACT PERSON", po.customerContactPerson || "--"],
    ["COMPANY NAME", companyName],
    ["ADDRESS", po.organizationAddress || "--"],
    ["PHONE", po.organizationContact || "--"],
    ["EMAIL ADDRESS", po.organizationEmail || "--"],
  ];

  // Measure both columns first so the shared light-blue-gray background can be drawn as one
  // rectangle before the text is drawn on top of it (matches the template's shaded field block).
  const measure = (fields: [string, string][], w: number) => {
    let my = fieldY;
    for (const [label, value] of fields) {
      const capH = doc.font(FONT_COMPANY).fontSize(9).heightOfString(label, { width: w });
      const valH = doc.font(FONT_BODY).fontSize(9.5).heightOfString(value || "--", { width: w });
      my += capH + 2 + valH + 8;
    }
    return my;
  };
  const fieldsBottom = Math.max(measure(vendorFields, vendorW), measure(customerFields, customerW));

  doc.rect(vendorX, fieldsTop, CONTENT_WIDTH, fieldsBottom - fieldsTop).fill(LIGHT_BG);
  doc
    .moveTo(customerX, fieldsTop)
    .lineTo(customerX, fieldsBottom)
    .strokeColor("#ffffff")
    .lineWidth(1)
    .stroke();

  let vendorY = fieldY;
  let customerY = fieldY;
  for (let i = 0; i < vendorFields.length; i++) {
    const [vLabel, vValue] = vendorFields[i]!;
    const [cLabel, cValue] = customerFields[i]!;
    vendorY = labeledField(doc, vendorX + 6, vendorY, vendorW - 12, vLabel, vValue) + 8;
    customerY = labeledField(doc, customerX + 6, customerY, customerW - 12, cLabel, cValue) + 8;
  }
  y = Math.max(vendorY, customerY) + 4;

  // ---- Shipping Terms / Delivery Period / Final Destination ----
  const colGap = 10;
  const triW = (CONTENT_WIDTH - colGap * 2) / 3;
  const triLabels = ["SHIPPING TERMS", "DELIVERY PERIOD", "FINAL DESTINATION"];
  const triValues = [po.incoterms || "--", po.deliveryPeriod || "--", po.finalDestination || "--"];
  for (let i = 0; i < 3; i++) {
    const x = MARGIN_LEFT + i * (triW + colGap);
    sectionBar(doc, x, y, triW, 16, triLabels[i]!);
  }
  const triValueTop = y + 16;
  const triTextY = triValueTop + 6;
  let maxTriHeight = 0;
  for (let i = 0; i < 3; i++) {
    const value = triValues[i]!;
    maxTriHeight = Math.max(maxTriHeight, doc.font(FONT_BODY).fontSize(9).heightOfString(value, { width: triW }));
  }
  const triValueH = maxTriHeight + 12;
  for (let i = 0; i < 3; i++) {
    const x = MARGIN_LEFT + i * (triW + colGap);
    doc.rect(x, triValueTop, triW, triValueH).fill(LIGHT_BG);
  }
  for (let i = 0; i < 3; i++) {
    const x = MARGIN_LEFT + i * (triW + colGap);
    doc.fillColor(BLACK).font(FONT_BODY).fontSize(9).text(triValues[i]!, x + 6, triTextY, { width: triW - 12 });
  }
  y = triValueTop + triValueH + 6;

  // ---- "Product Details" — a compact auto-width label (not a full-width bar), matching
  // the reference: it's a run-level highlight on the heading text, not a table cell. ----
  const productLabel = "Product Details";
  doc.font(FONT_COMPANY).fontSize(11);
  const productLabelW = doc.widthOfString(productLabel) + 20;
  doc.rect(MARGIN_LEFT, y, productLabelW, 22).fill(PRODUCT_LABEL_NAVY);
  doc.fillColor("#ffffff").text(productLabel, MARGIN_LEFT + 10, y + 5.5, { width: productLabelW - 20 });
  y += 22 + 5;

  // ---- Items table (ratio 1090:4580:1158:1522:1294) ----
  const colW = (twips: number) => (CONTENT_WIDTH * twips) / 9644;
  const cols = [
    { label: "HSN Code", width: colW(1090) },
    { label: "Product Description", width: colW(4580) },
    { label: "Quantity", width: colW(1158), align: "right" as const },
    { label: "Unit Price", width: colW(1522), align: "right" as const },
    { label: "Amount", width: colW(1294), align: "right" as const },
  ];
  // Unit goes in the Quantity header (matching the template) rather than appended to each
  // row's description, when every item shares one common unit.
  const itemUnits = new Set(po.items.map((i) => (i.unit || "").trim()).filter((u) => u.length > 0));
  const commonUnit = itemUnits.size === 1 ? [...itemUnits][0] : null;
  cols[2]!.label = commonUnit ? `Quantity (${commonUnit})` : "Quantity";

  let colX = MARGIN_LEFT;
  doc.font(FONT_COMPANY).fontSize(9);
  const headerH = Math.max(
    24,
    ...cols.map((col) => doc.heightOfString(col.label, { width: col.width - 10, align: col.align || "left" }) + 14),
  );
  for (const col of cols) {
    doc.rect(colX, y, col.width, headerH).fill(NAVY);
    doc
      .fillColor("#ffffff")
      .font(FONT_COMPANY)
      .fontSize(9)
      .text(col.label, colX + 5, y + 7, { width: col.width - 10, align: col.align || "left" });
    colX += col.width;
  }
  y += headerH;

  let itemsSubtotal = 0;
  for (const item of po.items) {
    const unitPrice = num(item.unitPrice);
    const amount = unitPrice * item.quantity;
    itemsSubtotal += amount;

    const rowUnit = (item.unit || "").trim();
    const rowQuantity = commonUnit
      ? String(item.quantity)
      : rowUnit
        ? `${item.quantity} ${rowUnit}`
        : String(item.quantity);
    const rowValues = [item.hsnCode || "", item.itemName, rowQuantity, fmtAmount(unitPrice), fmtAmount(amount)];
    const description = (item.description || "").trim();
    const descColWidth = cols[1]!.width - 10;
    const nameHeight = doc.font(FONT_BODY_BOLD).fontSize(8.5).heightOfString(item.itemName, { width: descColWidth });
    const descriptionHeight = description
      ? doc.font(FONT_BODY).fontSize(8.5).heightOfString(description, { width: descColWidth }) + 2
      : 0;
    const rowHeight = Math.max(
      18,
      nameHeight + descriptionHeight + 8,
      ...cols.slice(0, 1).concat(cols.slice(2)).map((col, i) => {
        const value = i === 0 ? rowValues[0]! : rowValues[i + 1]!;
        return doc.font(FONT_BODY).fontSize(8.5).heightOfString(value, { width: col.width - 10 }) + 8;
      }),
    );

    colX = MARGIN_LEFT;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]!;
      doc.rect(colX, y, col.width, rowHeight).fill(LIGHT_BG);
      doc.rect(colX, y, col.width, rowHeight).stroke("#ffffff");
      if (i === 1) {
        doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(8.5).text(item.itemName, colX + 5, y + 5, { width: descColWidth });
        if (description) {
          doc.fillColor(BLACK).font(FONT_BODY).fontSize(8.5).text(description, colX + 5, y + 5 + nameHeight + 2, { width: descColWidth });
        }
      } else {
        doc
          .fillColor(BLACK)
          .font(FONT_BODY)
          .fontSize(8.5)
          .text(rowValues[i]!, colX + 5, y + 5, { width: col.width - 10, align: col.align || "left" });
      }
      colX += col.width;
    }
    y += rowHeight;
  }

  // ---- Value Added Tax row (only when a tax % is set) — full row shaded light, label
  // left-aligned under Qty+Unit Price (merged), amount right-aligned under Amount. ----
  const taxPercent = num(po.taxPercent);
  const vatAmount = taxPercent > 0 ? itemsSubtotal * (taxPercent / 100) : 0;
  const grandTotal = itemsSubtotal + vatAmount;

  const hsnDescQtyW = cols[0]!.width + cols[1]!.width + cols[2]!.width;
  const qtyUnitPriceW = cols[2]!.width + cols[3]!.width;
  const unitPriceW = cols[3]!.width;
  const amountW = cols[4]!.width;
  const labelColsWidth = cols[0]!.width + cols[1]!.width;

  if (taxPercent > 0) {
    const vatRowH = 20;
    doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, vatRowH).fill(LIGHT_BG);
    doc
      .fillColor(BLACK)
      .font(FONT_BODY_BOLD)
      .fontSize(8.5)
      .text(`Value Added Tax @ ${taxPercent}%`, MARGIN_LEFT + labelColsWidth + 8, y + 6, { width: qtyUnitPriceW - 16 })
      .text(fmtAmount(vatAmount), MARGIN_LEFT + labelColsWidth + qtyUnitPriceW, y + 6, { width: amountW - 10, align: "right" });
    y += vatRowH;
  }

  // ---- Amount in Words (navy, bold italic white) + Grand Total (light bg, left-aligned) —
  // merged HSN+Description+Qty for the words, then Unit-Price-width label cell, then
  // Amount-width value cell, matching the reference exactly. ----
  const amountWordsText = `Amount in Words: ${amountToWords(grandTotal, po.currency?.trim() || "Rupees")}.`;
  const totalRowH = Math.max(30, doc.font(FONT_BODY_BOLD_ITALIC).fontSize(8.5).heightOfString(amountWordsText, { width: hsnDescQtyW - 16 }) + 12);

  doc.rect(MARGIN_LEFT, y, hsnDescQtyW, totalRowH).fill(NAVY);
  doc
    .fillColor("#ffffff")
    .font(FONT_BODY_BOLD_ITALIC)
    .fontSize(8.5)
    .text(amountWordsText, MARGIN_LEFT + 8, y + (totalRowH - doc.heightOfString(amountWordsText, { width: hsnDescQtyW - 16 })) / 2, {
      width: hsnDescQtyW - 16,
    });

  doc.rect(MARGIN_LEFT + hsnDescQtyW, y, unitPriceW, totalRowH).fill(LIGHT_BG);
  doc.rect(MARGIN_LEFT + hsnDescQtyW + unitPriceW, y, amountW, totalRowH).fill(LIGHT_BG);
  doc
    .fillColor(BLACK)
    .font(FONT_BODY_BOLD)
    .fontSize(8.5)
    .text("GRAND TOTAL", MARGIN_LEFT + hsnDescQtyW + 8, y + (totalRowH - 9) / 2, { width: unitPriceW - 16 });
  doc
    .fontSize(9.5)
    .text(fmtAmount(grandTotal), MARGIN_LEFT + hsnDescQtyW + unitPriceW + 8, y + (totalRowH - 10) / 2, { width: amountW - 16 });

  y += totalRowH + 14;

  // ---- Payment Terms ----
  sectionBar(doc, MARGIN_LEFT, y, CONTENT_WIDTH, 16, "PAYMENT TERMS");
  y += 16 + 8;
  const paymentTermsText = (po.paymentTerms || "").trim();
  if (paymentTermsText) {
    const numbered = /^\d+[.)]/.test(paymentTermsText) ? paymentTermsText : `1. ${paymentTermsText}`;
    doc.fillColor(BLACK).font(FONT_BODY).fontSize(9).text(numbered, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
    y = doc.y + 10;
  } else {
    y += 4;
  }

  if (po.terms) {
    doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(9).text("Notes:", MARGIN_LEFT, y);
    y = doc.y + 2;
    doc.font(FONT_BODY).fontSize(8.5).text(po.terms, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
    y = doc.y + 14;
  }

  // ---- Signature line — the org's uploaded signature image sits above the line if set,
  // otherwise it's left blank; the label is always the generic "Authorized Signatory"
  // (never a specific person's name), and the org's stamp sits alongside if set. ----
  const sigY = Math.max(y + 20, doc.page.height - 50);
  const sigW = 100;
  if (po.signatureImage) {
    try {
      doc.image(po.signatureImage, MARGIN_LEFT, sigY - 35, { fit: [sigW, 35], valign: "bottom" });
    } catch (err) {
      console.error("Failed to embed organization signature image:", err);
    }
  }
  doc.moveTo(MARGIN_LEFT, sigY).lineTo(MARGIN_LEFT + sigW, sigY).strokeColor(BLACK).lineWidth(0.75).stroke();
  doc.fillColor(SIGNATURE_GRAY).font(FONT_BODY_BOLD).fontSize(8).text("Authorized Signatory", MARGIN_LEFT, sigY + 5, { width: 160 });
  if (po.stampImage) {
    try {
      doc.image(po.stampImage, MARGIN_LEFT + sigW + 24, sigY - 66, { fit: [82, 82] });
    } catch (err) {
      console.error("Failed to embed organization stamp image:", err);
    }
  }

  return doc;
}

/** Renders the PDF fully in memory and resolves with the finished bytes — used when the file needs to be written to disk. For a live HTTP download, prefer `buildPurchaseOrderPdf(po).pipe(res)` directly to avoid buffering. */
export function purchaseOrderPdfBuffer(po: PurchaseOrderPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = buildPurchaseOrderPdf(po);
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
