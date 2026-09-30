import PDFDocument from "pdfkit";
import { amountToWords } from "./numberToWords";

/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic
 * (same convention as costSheet.ts / purchaseOrderPdf.ts / proformaInvoicePdf.ts). */
const num = (value: { toNumber(): number } | number | string | null | undefined): number => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
};

export interface QuotationPdfItem {
  itemName: string;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  rate?: { toNumber(): number } | number | string | null;
}

export interface QuotationPdfData {
  quotationNumber?: string | null;
  quotationDate?: Date | null;
  title?: string | null;
  taxPercent?: { toNumber(): number } | number | string | null;
  currency?: string | null;

  // "From" box — this app's own organization (the seller/quoter).
  organizationName?: string | null;
  organizationAddress?: string | null;
  organizationContact?: string | null;
  organizationEmail?: string | null;
  fromPan?: string | null;
  regNo?: string | null;
  /** Shown at the top-left of the letterhead, beside the company name. */
  logoImage?: Buffer | null;

  // "To" box — the prospective customer.
  customerName?: string | null;
  customerAddress?: string | null;
  customerContact?: string | null;
  customerEmail?: string | null;
  customerPan?: string | null;

  // Terms and Conditions box.
  priceBasis?: string | null;
  deliveryPeriod?: string | null;
  paymentTerms?: string | null;
  validityPeriod?: string | null;

  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  signatureImage?: Buffer | null;
  stampImage?: Buffer | null;

  items: QuotationPdfItem[];
}

// A plain black-on-white formal-letter theme, matching the company's reference paper quotation —
// deliberately not the colored navy/green section-bar theme purchaseOrderPdf.ts/proformaInvoicePdf.ts
// use, since the reference document has no colored fills at all.
const BLACK = "#000000";
const MUTED = "#3f3f3f";
const BORDER = "#000000";
const HEADER_BG = "#F2F2EF";
const SIGNATURE_GRAY = "#545454";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_TOP = 20;
const MARGIN_RIGHT = 46;
const MARGIN_BOTTOM = 40;
const MARGIN_LEFT = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const FONT_COMPANY = "Company";
const FONT_BODY = "Body";
const FONT_BODY_BOLD = "Body-Bold";
const FONT_BODY_ITALIC = "Body-Italic";
const FONT_BODY_BOLD_ITALIC = "Body-BoldItalic";
// Carlito — a free, metric-compatible substitute for Calibri (a proprietary Microsoft font that
// can't be redistributed/embedded), matching proformaInvoicePdf.ts's font choice.
const FONT_COMPANY_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-700-normal.woff");
const FONT_BODY_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-400-normal.woff");
const FONT_BODY_BOLD_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-700-normal.woff");
const FONT_BODY_ITALIC_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-400-italic.woff");
const FONT_BODY_BOLD_ITALIC_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-700-italic.woff");

const fmtAmount = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ORDINAL_SUFFIX = (day: number): string => {
  if (day % 10 === 1 && day !== 11) return "st";
  if (day % 10 === 2 && day !== 12) return "nd";
  if (day % 10 === 3 && day !== 13) return "rd";
  return "th";
};
/** "28th September, 2026" — matches the reference document's date style. */
const fmtOrdinalDate = (d?: Date | null): string => {
  if (!d) return "--";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return `${day}${ORDINAL_SUFFIX(day)} ${month}, ${d.getFullYear()}`;
};

/**
 * Renders a Price Quotation as a PDF matching the company's reference paper quotation: a plain
 * letterhead (company name/address/Reg No, no colored banner), a centered underlined "PRICE
 * QUOTATION" title with Date/Q. No. at the right, a From/To box, a subject line + intro
 * paragraph, an items table (bold item name + italic spec lines, white cells with thin black
 * borders — mirrors proformaInvoicePdf.ts's items table styling) with Sub-Total/VAT/Total rows,
 * an "In Words" line, a boxed Terms and Conditions list, and a signature block.
 */
export function buildQuotationPdf(q: QuotationPdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margins: { top: MARGIN_TOP, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT } });
  doc.registerFont(FONT_COMPANY, FONT_COMPANY_PATH);
  doc.registerFont(FONT_BODY, FONT_BODY_PATH);
  doc.registerFont(FONT_BODY_BOLD, FONT_BODY_BOLD_PATH);
  doc.registerFont(FONT_BODY_ITALIC, FONT_BODY_ITALIC_PATH);
  doc.registerFont(FONT_BODY_BOLD_ITALIC, FONT_BODY_BOLD_ITALIC_PATH);
  let y = MARGIN_TOP;

  const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;
  function ensureSpace(needed: number) {
    if (y + needed > PAGE_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  }

  const hr = (yy: number, color = BORDER, width = 0.75) => {
    doc.moveTo(MARGIN_LEFT, yy).lineTo(MARGIN_LEFT + CONTENT_WIDTH, yy).strokeColor(color).lineWidth(width).stroke();
  };
  // ---- Letterhead: logo (if any) + company name/address on the left, Reg No. at the right ----
  const companyName = q.organizationName || "Quotation";
  const logoSize = 94;
  const logoGap = 10;
  const hasLogo = !!q.logoImage;
  const textX = hasLogo ? MARGIN_LEFT + logoSize + logoGap : MARGIN_LEFT;
  const textW = CONTENT_WIDTH * 0.62 - (hasLogo ? logoSize + logoGap : 0);
  if (hasLogo) {
    try {
      doc.image(q.logoImage!, MARGIN_LEFT, y, { fit: [logoSize, logoSize] });
    } catch (err) {
      console.error("Failed to embed organization logo image:", err);
    }
  }
  doc.fillColor(BLACK).font(FONT_COMPANY).fontSize(18).text(companyName, textX, y, { width: textW });
  const nameBottom = doc.y;
  let addressBottom = nameBottom;
  if (q.organizationAddress) {
    doc.fillColor(MUTED).font(FONT_BODY_BOLD).fontSize(9.5).text(q.organizationAddress, textX, nameBottom + 2, { width: textW });
    addressBottom = doc.y;
  }
  if (q.regNo) {
    doc.fillColor(BLACK).font(FONT_BODY).fontSize(9).text(`Reg No:- ${q.regNo}`, MARGIN_LEFT, y + 2, { width: CONTENT_WIDTH, align: "right" });
  }
  // 10px below the address text specifically — independent of the logo's height, which may run
  // past this line if it's taller than the name+address text block.
  y = addressBottom + 10;
  hr(y);
  y += 14;

  // ---- Centered "PRICE QUOTATION" title, Date/Q. No. stacked at the right ----
  const titleY = y;
  doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(14).text("PRICE QUOTATION", MARGIN_LEFT, titleY, { width: CONTENT_WIDTH, align: "center" });
  const titleW = doc.widthOfString("PRICE QUOTATION");
  doc.moveTo(MARGIN_LEFT + (CONTENT_WIDTH - titleW) / 2, doc.y + 1).lineTo(MARGIN_LEFT + (CONTENT_WIDTH - titleW) / 2 + titleW, doc.y + 1).strokeColor(BLACK).lineWidth(0.75).stroke();
  const dateText = fmtOrdinalDate(q.quotationDate);
  const qNoText = `Q. No:- ${q.quotationNumber || "--"}`;
  doc.fillColor(BLACK).font(FONT_BODY).fontSize(9).text(dateText, MARGIN_LEFT, titleY, { width: CONTENT_WIDTH, align: "right" });
  doc.text(qNoText, MARGIN_LEFT, doc.y + 1, { width: CONTENT_WIDTH, align: "right" });
  y = Math.max(doc.y, titleY + 30) + 4;

  // White cell with a thin black border — used for the From/To table below and the items table
  // further down.
  const cellBox = (x: number, cy: number, w: number, h: number, outerLeft: boolean, outerRight: boolean) => {
    const lw = 0.75;
    const half = lw / 2;
    doc.rect(x, cy, w, h).fill("#ffffff");
    doc.lineWidth(lw).strokeColor(BORDER);
    doc.moveTo(x, cy).lineTo(x + w, cy).stroke();
    doc.moveTo(x, cy + h).lineTo(x + w, cy + h).stroke();
    const leftX = outerLeft ? x + half : x;
    const rightX = outerRight ? x + w - half : x + w;
    doc.moveTo(leftX, cy).lineTo(leftX, cy + h).stroke();
    doc.moveTo(rightX, cy).lineTo(rightX, cy + h).stroke();
  };

  // ---- From / To table — a 2-column bordered table (header row + one row per field), matching
  // the items table's white-cell/black-border look rather than plain stacked text. ----
  const fromW = CONTENT_WIDTH * 0.46;
  const toW = CONTENT_WIDTH - fromW;
  const fromX = MARGIN_LEFT;
  const toX = MARGIN_LEFT + fromW;
  const boxTop = y;

  /** A row's cell is either the bold company/customer name (no label), or a bold label
   * ("Location:", "PAN:", ...) followed by a plain-text value on the same line. */
  type FromToField = { label: string | null; value: string; nameRow?: boolean };
  const fromFields: FromToField[] = [
    { label: null, value: q.organizationName || "--", nameRow: true },
    { label: "Location:", value: q.organizationAddress || "--" },
    { label: "PAN:", value: q.fromPan || "--" },
    { label: "Phone No:", value: q.organizationContact || "--" },
    { label: "Email:", value: q.organizationEmail || "--" },
  ];
  const toFields: FromToField[] = [
    { label: null, value: q.customerName || "--", nameRow: true },
    { label: "Location:", value: q.customerAddress || "--" },
    { label: "PAN:", value: q.customerPan || "--" },
    { label: "Phone No:", value: q.customerContact || "--" },
    { label: "Email:", value: q.customerEmail || "--" },
  ];

  const fromToHeaderH = 18;
  cellBox(fromX, boxTop, fromW, fromToHeaderH, true, false);
  cellBox(toX, boxTop, toW, fromToHeaderH, false, true);
  doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(10).text("From", fromX + 6, boxTop + 4, { width: fromW - 12 });
  doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(10).text("To", toX + 6, boxTop + 4, { width: toW - 12 });

  const measureField = (f: FromToField, w: number) =>
    f.nameRow
      ? doc.font(FONT_BODY_BOLD).fontSize(9.5).heightOfString(f.value, { width: w })
      : doc.font(FONT_BODY).fontSize(9.5).heightOfString(f.label ? `${f.label} ${f.value}` : f.value, { width: w });
  const drawField = (f: FromToField, x: number, cy: number, w: number) => {
    if (f.nameRow) {
      doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(9.5).text(f.value, x, cy, { width: w });
      return;
    }
    if (f.label) {
      doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(9.5).text(f.label, x, cy, { continued: true }).font(FONT_BODY).text(` ${f.value}`);
    } else {
      doc.fillColor(BLACK).font(FONT_BODY).fontSize(9.5).text(f.value, x, cy, { width: w });
    }
  };

  let rowY = boxTop + fromToHeaderH;
  for (let i = 0; i < fromFields.length; i++) {
    const fromField = fromFields[i]!;
    const toField = toFields[i]!;
    const rowH = Math.max(measureField(fromField, fromW - 12), measureField(toField, toW - 12)) + 10;
    cellBox(fromX, rowY, fromW, rowH, true, false);
    cellBox(toX, rowY, toW, rowH, false, true);
    drawField(fromField, fromX + 6, rowY + 5, fromW - 12);
    drawField(toField, toX + 6, rowY + 5, toW - 12);
    rowY += rowH;
  }
  y = rowY + 10;

  // ---- Subject line + intro paragraph ----
  if (q.title) {
    ensureSpace(20);
    doc.fillColor(BLACK).font(FONT_BODY_BOLD_ITALIC).fontSize(11).text(q.title, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
    y = doc.y + 10;
  }
  ensureSpace(16);
  doc.fillColor(BLACK).font(FONT_BODY).fontSize(10).text("Dear Sir/Madam,", MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 8;
  ensureSpace(16);
  doc
    .fillColor(BLACK)
    .font(FONT_BODY)
    .fontSize(10)
    .text("We are pleased to provide you with the following price quotation.", MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 14;

  // ---- Items table ----
  const currencyCode = q.currency?.trim() || "NPR";
  const cols = [
    { key: "item", label: "Item/Description", width: CONTENT_WIDTH * 0.4 },
    { key: "qty", label: "Quantity", width: CONTENT_WIDTH * 0.13, align: "right" as const },
    { key: "unit", label: "Unit", width: CONTENT_WIDTH * 0.11 },
    { key: "rate", label: "Rate", width: CONTENT_WIDTH * 0.16, align: "right" as const },
    { key: "amount", label: `Amount (${currencyCode})`, width: CONTENT_WIDTH * 0.2, align: "right" as const },
  ];

  let colX = MARGIN_LEFT;
  doc.font(FONT_BODY_BOLD).fontSize(9);
  const headerH = Math.max(20, ...cols.map((col) => doc.heightOfString(col.label, { width: col.width - 8, align: col.align || "left" }) + 10));
  ensureSpace(headerH);
  for (const col of cols) {
    doc.rect(colX, y, col.width, headerH).fill(HEADER_BG);
    doc.lineWidth(0.75).strokeColor(BORDER).rect(colX, y, col.width, headerH).stroke();
    doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(9).text(col.label, colX + 4, y + (headerH - 9) / 2 - 1, { width: col.width - 8, align: col.align || "left" });
    colX += col.width;
  }
  y += headerH;

  let subtotal = 0;
  for (const item of q.items) {
    const rate = num(item.rate);
    const amount = rate * item.quantity;
    subtotal += amount;

    doc.font(FONT_BODY_BOLD).fontSize(9.5);
    const nameH = doc.heightOfString(item.itemName, { width: cols[0]!.width - 8 });
    const descH = item.description ? doc.font(FONT_BODY_ITALIC).fontSize(8.5).heightOfString(item.description, { width: cols[0]!.width - 8 }) + 2 : 0;
    const rowValues = ["", item.quantity.toLocaleString(), item.unit || "--", fmtAmount(rate), fmtAmount(amount)];
    const rowHeight = Math.max(
      nameH + descH + 8,
      ...cols.slice(1).map((col, i) => doc.font(FONT_BODY).fontSize(9.5).heightOfString(rowValues[i + 1]!, { width: col.width - 8 }) + 8),
    );
    ensureSpace(rowHeight);

    colX = MARGIN_LEFT;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]!;
      cellBox(colX, y, col.width, rowHeight, i === 0, i === cols.length - 1);
      if (i === 0) {
        doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(9.5).text(item.itemName, colX + 4, y + 4, { width: col.width - 8 });
        if (item.description) {
          doc.fillColor(MUTED).font(FONT_BODY_ITALIC).fontSize(8.5).text(item.description, colX + 4, doc.y + 1, { width: col.width - 8 });
        }
      } else {
        doc.fillColor(BLACK).font(FONT_BODY).fontSize(9.5).text(rowValues[i]!, colX + 4, y + 4, { width: col.width - 8, align: col.align || "left" });
      }
      colX += col.width;
    }
    y += rowHeight;
  }

  // ---- Sub-Total / VAT / Total rows ----
  const taxPercent = num(q.taxPercent) || 13;
  const vatAmount = subtotal * (taxPercent / 100);
  const grandTotal = subtotal + vatAmount;
  const labelW = cols[0]!.width + cols[1]!.width + cols[2]!.width + cols[3]!.width;
  const amountW = cols[4]!.width;

  ensureSpace(3 * 18);
  const summaryRow = (label: string, value: number, bold = false) => {
    const rowH = 18;
    cellBox(MARGIN_LEFT, y, labelW, rowH, true, false);
    cellBox(MARGIN_LEFT + labelW, y, amountW, rowH, false, true);
    doc
      .fillColor(BLACK)
      .font(bold ? FONT_BODY_BOLD : FONT_BODY)
      .fontSize(9.5)
      .text(label, MARGIN_LEFT + labelW - 180, y + 4, { width: 174, align: "right" })
      .font(bold ? FONT_BODY_BOLD : FONT_BODY)
      .text(fmtAmount(value), MARGIN_LEFT + labelW + 4, y + 4, { width: amountW - 8, align: "right" });
    y += rowH;
  };
  summaryRow("Sub-Total", subtotal, true);
  summaryRow(`VAT@${taxPercent}%`, vatAmount);
  summaryRow("Total", grandTotal, true);
  y += 10;

  // ---- Amount in Words ----
  ensureSpace(16);
  doc
    .fillColor(BLACK)
    .font(FONT_BODY_BOLD_ITALIC)
    .fontSize(9.5)
    .text(`In Words:- ${amountToWords(Math.round(grandTotal), currencyCode)}.`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 16;

  // ---- Terms and Conditions, boxed ----
  const termsRows: [string, string][] = [
    ["Price Basis:", q.priceBasis || "--"],
    ["Delivery Period:-", q.deliveryPeriod || "--"],
    ["Payment Terms:-", q.paymentTerms || "--"],
    ["Validity of Quotation:-", q.validityPeriod || "--"],
  ];
  doc.font(FONT_BODY_BOLD).fontSize(10);
  const termsHeadingH = doc.heightOfString("Terms and Conditions", { width: 200 }) + 6;
  const measureTermRow = (label: string, value: string) => {
    const numW = 16;
    const labelW2 = 130;
    const valueW = CONTENT_WIDTH - 16 - numW - labelW2 - 8;
    return Math.max(
      doc.font(FONT_BODY_BOLD).fontSize(9.5).heightOfString(label, { width: labelW2 }),
      doc.font(FONT_BODY).fontSize(9.5).heightOfString(value, { width: valueW }),
    ) + 5;
  };
  let termsH = termsHeadingH + 8;
  for (const [label, value] of termsRows) termsH += measureTermRow(label, value);
  ensureSpace(termsH);

  const termsBoxTop = y;
  // Heading, then a full-width rule right below it, separating "Terms and Conditions" from the
  // numbered list — in addition to the box's own border drawn around the whole thing below.
  doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(10).text("Terms and Conditions", MARGIN_LEFT + 8, termsBoxTop + 6, { width: CONTENT_WIDTH - 16 });
  const headingRuleY = doc.y + 2;
  doc.moveTo(MARGIN_LEFT, headingRuleY).lineTo(MARGIN_LEFT + CONTENT_WIDTH, headingRuleY).strokeColor(BORDER).lineWidth(0.75).stroke();
  let ty = termsBoxTop + 6 + termsHeadingH;
  const numW = 16;
  const labelW2 = 130;
  const valueW = CONTENT_WIDTH - 16 - numW - labelW2 - 8;
  termsRows.forEach(([label, value], i) => {
    doc.fillColor(BLACK).font(FONT_BODY).fontSize(9.5).text(String(i + 1), MARGIN_LEFT + 8, ty, { width: numW });
    doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(9.5).text(label, MARGIN_LEFT + 8 + numW, ty, { width: labelW2 });
    doc.fillColor(BLACK).font(FONT_BODY).fontSize(9.5).text(value, MARGIN_LEFT + 8 + numW + labelW2 + 8, ty, { width: valueW });
    ty += measureTermRow(label, value);
  });
  const termsBoxBottom = termsBoxTop + termsH;
  doc.lineWidth(0.75).strokeColor(BORDER).rect(MARGIN_LEFT, termsBoxTop, CONTENT_WIDTH, termsBoxBottom - termsBoxTop).stroke();
  y = termsBoxBottom + 20;

  // ---- Signature block ----
  ensureSpace(100);
  doc.fillColor(BLACK).font(FONT_BODY).fontSize(10).text("Thanks and Regards", MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 4;
  doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(10).text(`For ${companyName}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y = doc.y + 8;

  const sigY = y + 55;
  if (q.signatureImage) {
    try {
      doc.image(q.signatureImage, MARGIN_LEFT, sigY - 35, { fit: [110, 35], valign: "bottom" });
    } catch (err) {
      console.error("Failed to embed organization signature image:", err);
    }
  }
  if (q.stampImage) {
    try {
      doc.image(q.stampImage, MARGIN_LEFT + 120, sigY - 66, { fit: [82, 82] });
    } catch (err) {
      console.error("Failed to embed organization stamp image:", err);
    }
  }
  if (q.signatoryName) {
    doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(9.5).text(q.signatoryName, MARGIN_LEFT, sigY + 8, { width: 220 });
  }
  if (q.signatoryDesignation) {
    doc.fillColor(SIGNATURE_GRAY).font(FONT_BODY).fontSize(9).text(q.signatoryDesignation, MARGIN_LEFT, doc.y + 1, { width: 220 });
  }

  return doc;
}

/** Renders the PDF fully in memory — mirrors proformaInvoicePdfBuffer/purchaseOrderPdfBuffer. */
export function quotationPdfBuffer(q: QuotationPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = buildQuotationPdf(q);
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
