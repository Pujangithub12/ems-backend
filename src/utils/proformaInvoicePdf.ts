import PDFDocument from "pdfkit";
import { amountToWords } from "./numberToWords";

/** Postgres `numeric` columns come back as Prisma's Decimal wrapper or null — coerce for arithmetic (same convention as costSheet.ts / purchaseOrderPdf.ts). */
const num = (value: { toNumber(): number } | number | string | null | undefined): number => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value) || 0;
  const n = value.toNumber();
  return Number.isFinite(n) ? n : 0;
};

export interface ProformaInvoicePdfItem {
  itemName: string;
  quantity: number;
  unit?: string | null;
  unitPrice?: { toNumber(): number } | number | string | null;
  hsnCode?: string | null;
  taxable: boolean;
}

export interface ProformaInvoicePdfData {
  piNumber?: string | null;
  piDate?: Date | null;
  taxPercent?: { toNumber(): number } | number | string | null;
  currency?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;

  // CUSTOMER box — the buying organization (this app's org), mirrors purchaseOrderPdf.ts.
  customerContactPerson?: string | null;
  customerPan?: string | null;
  organizationName?: string | null;
  organizationAddress?: string | null;
  organizationContact?: string | null;
  organizationEmail?: string | null;

  // VENDOR box — the external vendor supplying the goods.
  vendorPan?: string | null;
  vendor?: {
    name: string;
    contactPerson?: string | null;
    address?: string | null;
    location?: string | null;
    contact?: string | null;
    email?: string | null;
  } | null;

  // Bank Details box.
  bankBeneficiaryName?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankSwiftCode?: string | null;
  bankAddress?: string | null;

  // Terms of Delivery box.
  deliveryTerms?: string | null;
  placeOfLoading?: string | null;
  placeOfDischarge?: string | null;
  modeOfShipment?: string | null;

  signatureImage?: Buffer | null;
  stampImage?: Buffer | null;

  items: ProformaInvoicePdfItem[];
}

// Colors — reused from purchaseOrderPdf.ts so both generated documents share one visual language.
const NAVY = "#1B3E6B";
const BADGE_NAVY = "#234061";
const LIGHT_BG = "#DCE6F0";
const BLACK = "#000000";
const SIGNATURE_GRAY = "#545454";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_TOP = 40;
const MARGIN_RIGHT = 54;
const MARGIN_BOTTOM = 14;
const MARGIN_LEFT = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const FONT_COMPANY = "Company";
const FONT_BODY = "Body";
const FONT_BODY_BOLD = "Body-Bold";
const FONT_BODY_BOLD_ITALIC = "Body-BoldItalic";
const FONT_COMPANY_PATH = require.resolve("@fontsource/caladea/files/caladea-latin-700-normal.woff");
const FONT_BODY_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-400-normal.woff");
const FONT_BODY_BOLD_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-700-normal.woff");
const FONT_BODY_BOLD_ITALIC_PATH = require.resolve("@fontsource/carlito/files/carlito-latin-700-italic.woff");

const fmtDate = (d?: Date | null) => (d ? d.toLocaleDateString("en-US") : "--");
const fmtAmount = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sectionBar(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, label: string, fontSize = 11) {
  doc.rect(x, y, width, height).fill(NAVY);
  doc
    .fillColor("#ffffff")
    .font(FONT_COMPANY)
    .fontSize(fontSize)
    .text(label, x + 6, y + (height - fontSize) / 2, { width: width - 12 });
}

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
 * Renders a Proforma Invoice as a PDF matching the company's reference paper form: company
 * letterhead + "PROFORMA INVOICE" badge, PI No./Date box, CUSTOMER (buying org)/VENDOR
 * (supplying vendor) boxes with PAN, an items table split into Non-Taxable/Taxable/VAT/Grand
 * Total, Payment Terms, Bank Details, Terms of Delivery, and a Notes + signature block. Visual
 * language (colors, fonts, section-bar style) matches purchaseOrderPdf.ts so both PDFs feel
 * like the same document family.
 */
export function buildProformaInvoicePdf(pi: ProformaInvoicePdfData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margins: { top: MARGIN_TOP, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT } });
  doc.registerFont(FONT_COMPANY, FONT_COMPANY_PATH);
  doc.registerFont(FONT_BODY, FONT_BODY_PATH);
  doc.registerFont(FONT_BODY_BOLD, FONT_BODY_BOLD_PATH);
  doc.registerFont(FONT_BODY_BOLD_ITALIC, FONT_BODY_BOLD_ITALIC_PATH);
  let y = MARGIN_TOP;

  // The layout below places everything at manually-tracked y coordinates rather than
  // relying on PDFKit's own flowing-text pagination (which — since most of this document is
  // drawn with rect()/positioned text, not one continuous flow — was letting `y` run past the
  // bottom of the page before anything actually broke to a new page, leaving a near-empty
  // trailing page under the last section that *did* fit). Call this before starting any
  // section that wouldn't fit in the remaining space, so a fresh page starts exactly where
  // the next section begins instead of after a stretch of invisible overflow.
  const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;
  function ensureSpace(needed: number) {
    if (y + needed > PAGE_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  }

  // ---- Letterhead: company name + address/phone left-aligned; PI No./Date box top-right;
  // a centered "PROFORMA INVOICE" title sits right above the Customer/Vendor table. ----
  const companyName = pi.organizationName || "Proforma Invoice";
  const metaW = 160;
  const metaX = MARGIN_LEFT + CONTENT_WIDTH - metaW;
  const metaTop = y;
  sectionBar(doc, metaX, metaTop, metaW / 2, 16, "PI NO.", 7.5);
  sectionBar(doc, metaX + metaW / 2, metaTop, metaW / 2, 16, "DATE", 7.5);
  doc
    .rect(metaX, metaTop + 16, metaW / 2, 18)
    .stroke(LIGHT_BG)
    .rect(metaX + metaW / 2, metaTop + 16, metaW / 2, 18)
    .stroke(LIGHT_BG);
  doc
    .fillColor(BLACK)
    .font(FONT_BODY_BOLD)
    .fontSize(9)
    .text(pi.piNumber || "--", metaX + 4, metaTop + 21, { width: metaW / 2 - 8 })
    .text(fmtDate(pi.piDate), metaX + metaW / 2 + 4, metaTop + 21, { width: metaW / 2 - 8 });
  const metaBottom = metaTop + 16 + 18;

  // Company name/address, left-aligned, constrained to the space left of the PI No./Date
  // box so it never runs underneath it.
  const nameBlockW = CONTENT_WIDTH - metaW - 16;
  doc
    .fillColor(NAVY)
    .font(FONT_COMPANY)
    .fontSize(22)
    .text(companyName, MARGIN_LEFT, y + 4, { width: nameBlockW });
  y = doc.y + 4;

  const letterheadLine = [pi.organizationAddress, pi.organizationContact]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(" | ");
  if (letterheadLine) {
    doc.fillColor(NAVY).font(FONT_BODY_BOLD).fontSize(9).text(letterheadLine, MARGIN_LEFT, y, { width: nameBlockW });
    y = doc.y;
  }
  y = Math.max(y, metaBottom) + 16;

  // ---- Centered "PROFORMA INVOICE" title, right above the Customer/Vendor table — plain
  // navy text, no background fill. ----
  doc
    .fillColor(NAVY)
    .font(FONT_BODY_BOLD)
    .fontSize(15)
    .text("PROFORMA INVOICE", MARGIN_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
  y = doc.y + 10;

  // ---- Customer / Vendor, one table (matches purchaseOrderPdf.ts's Vendor/Customer table, ratio flipped: Customer first as in the reference) ----
  const customerW = (CONTENT_WIDTH * 5625) / 9644;
  const vendorW = CONTENT_WIDTH - customerW;
  const customerX = MARGIN_LEFT;
  const vendorX = MARGIN_LEFT + customerW;

  sectionBar(doc, customerX, y, customerW, 16, "CUSTOMER");
  sectionBar(doc, vendorX, y, vendorW, 16, "VENDOR");
  const fieldsTop = y + 16;
  const fieldY = fieldsTop + 8;

  const vendor = pi.vendor;
  const customerFields: [string, string][] = [
    ["NAME OF CONTACT PERSON", pi.customerContactPerson || "--"],
    ["COMPANY NAME", companyName],
    ["ADDRESS", pi.organizationAddress || "--"],
    ["PAN NO.", pi.customerPan || "--"],
    ["EMAIL ID", pi.organizationEmail || "--"],
    ["CONTACT NO.", pi.organizationContact || "--"],
  ];
  const vendorFields: [string, string][] = [
    ["NAME OF CONTACT PERSON", vendor?.contactPerson || "--"],
    ["COMPANY NAME", vendor?.name || "--"],
    ["ADDRESS", vendor?.address || vendor?.location || "--"],
    ["PAN NO.", pi.vendorPan || "--"],
    ["EMAIL ID", vendor?.email || "--"],
    ["CONTACT NO.", vendor?.contact || "--"],
  ];

  const measure = (fields: [string, string][], w: number) => {
    let my = fieldY;
    for (const [label, value] of fields) {
      const capH = doc.font(FONT_COMPANY).fontSize(9).heightOfString(label, { width: w });
      const valH = doc.font(FONT_BODY).fontSize(9.5).heightOfString(value || "--", { width: w });
      my += capH + 2 + valH + 8;
    }
    return my;
  };
  const fieldsBottom = Math.max(measure(customerFields, customerW), measure(vendorFields, vendorW));

  doc.rect(customerX, fieldsTop, CONTENT_WIDTH, fieldsBottom - fieldsTop).fill(LIGHT_BG);
  doc
    .moveTo(vendorX, fieldsTop)
    .lineTo(vendorX, fieldsBottom)
    .strokeColor("#ffffff")
    .lineWidth(1)
    .stroke();

  let customerY = fieldY;
  let vendorY = fieldY;
  for (let i = 0; i < customerFields.length; i++) {
    const [cLabel, cValue] = customerFields[i]!;
    const [vLabel, vValue] = vendorFields[i]!;
    customerY = labeledField(doc, customerX + 6, customerY, customerW - 12, cLabel, cValue) + 8;
    vendorY = labeledField(doc, vendorX + 6, vendorY, vendorW - 12, vLabel, vValue) + 8;
  }
  y = Math.max(customerY, vendorY) + 8;

  // ---- Items table (H.S. Code, Commodity & Specification, Qty, Unit, Unit Price, Amount) ----
  const colW = (twips: number) => (CONTENT_WIDTH * twips) / 9644;
  const cols = [
    { label: "H.S. Code", width: colW(1090) },
    { label: "Commodity & Specification", width: colW(3400) },
    { label: "Qty", width: colW(1000), align: "right" as const },
    { label: "Unit", width: colW(900) },
    { label: "Unit Price (" + (pi.currency?.trim() || "NPR") + ")", width: colW(1600), align: "right" as const },
    { label: "Amount (" + (pi.currency?.trim() || "NPR") + ")", width: colW(1654), align: "right" as const },
  ];

  let colX = MARGIN_LEFT;
  doc.font(FONT_COMPANY).fontSize(8.5);
  const headerH = Math.max(
    22,
    ...cols.map((col) => doc.heightOfString(col.label, { width: col.width - 8, align: col.align || "left" }) + 12),
  );
  ensureSpace(headerH);
  for (const col of cols) {
    doc.rect(colX, y, col.width, headerH).fill(NAVY);
    doc
      .fillColor("#ffffff")
      .font(FONT_COMPANY)
      .fontSize(8.5)
      .text(col.label, colX + 4, y + 6, { width: col.width - 8, align: col.align || "left" });
    colX += col.width;
  }
  y += headerH;

  let taxableSubtotal = 0;
  let nonTaxableSubtotal = 0;
  for (const item of pi.items) {
    const unitPrice = num(item.unitPrice);
    const amount = unitPrice * item.quantity;
    if (item.taxable) taxableSubtotal += amount;
    else nonTaxableSubtotal += amount;

    const rowValues = [item.hsnCode || "--", item.itemName, String(item.quantity), item.unit || "--", fmtAmount(unitPrice), fmtAmount(amount)];
    const rowHeight = Math.max(
      16,
      ...cols.map((col, i) => doc.font(FONT_BODY).fontSize(8.5).heightOfString(rowValues[i]!, { width: col.width - 8 }) + 8),
    );
    ensureSpace(rowHeight);

    colX = MARGIN_LEFT;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]!;
      doc.rect(colX, y, col.width, rowHeight).fill(LIGHT_BG);
      doc.rect(colX, y, col.width, rowHeight).stroke("#ffffff");
      doc
        .fillColor(BLACK)
        .font(i === 1 ? FONT_BODY_BOLD : FONT_BODY)
        .fontSize(8.5)
        .text(rowValues[i]!, colX + 4, y + 4, { width: col.width - 8, align: col.align || "left" });
      colX += col.width;
    }
    y += rowHeight;
  }

  // ---- Non-Taxable / Taxable / VAT / Total rows ----
  const taxPercent = num(pi.taxPercent) || 13;
  const vatAmount = taxableSubtotal * (taxPercent / 100);
  const grandTotal = nonTaxableSubtotal + taxableSubtotal + vatAmount;

  const labelW = cols[0]!.width + cols[1]!.width + cols[2]!.width + cols[3]!.width + cols[4]!.width;
  const amountW = cols[5]!.width;

  ensureSpace(3 * 18 + 22);
  const summaryRow = (label: string, value: number, opts?: { bold?: boolean }) => {
    const rowH = 18;
    doc.rect(MARGIN_LEFT, y, labelW, rowH).fill(LIGHT_BG);
    doc.rect(MARGIN_LEFT + labelW, y, amountW, rowH).fill(LIGHT_BG);
    doc
      .fillColor(BLACK)
      .font(opts?.bold ? FONT_BODY_BOLD : FONT_BODY)
      .fontSize(8.5)
      .text(label, MARGIN_LEFT + labelW - 160, y + 5, { width: 154, align: "right" })
      .text(fmtAmount(value), MARGIN_LEFT + labelW + 4, y + 5, { width: amountW - 8, align: "right" });
    y += rowH;
  };
  summaryRow("Non-Taxable Amount", nonTaxableSubtotal);
  summaryRow("Taxable Amount", taxableSubtotal);
  summaryRow(`VAT @ ${taxPercent}%`, vatAmount);

  const totalRowH = 22;
  doc.rect(MARGIN_LEFT, y, labelW, totalRowH).fill(NAVY);
  doc.rect(MARGIN_LEFT + labelW, y, amountW, totalRowH).fill(NAVY);
  doc
    .fillColor("#ffffff")
    .font(FONT_BODY_BOLD)
    .fontSize(9.5)
    .text("TOTAL AMOUNT", MARGIN_LEFT + labelW - 160, y + 6, { width: 154, align: "right" })
    .text(fmtAmount(grandTotal), MARGIN_LEFT + labelW + 4, y + 6, { width: amountW - 8, align: "right" });
  y += totalRowH + 8;

  // ---- Amount in Words ----
  const amountWordsText = `Amount in words: ${amountToWords(grandTotal, pi.currency?.trim() || "Rupees")}.`;
  const wordsH = Math.max(22, doc.font(FONT_BODY_BOLD_ITALIC).fontSize(8.5).heightOfString(amountWordsText, { width: CONTENT_WIDTH - 16 }) + 12);
  ensureSpace(wordsH);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, wordsH).fill(BADGE_NAVY);
  doc
    .fillColor("#ffffff")
    .font(FONT_BODY_BOLD_ITALIC)
    .fontSize(8.5)
    .text(amountWordsText, MARGIN_LEFT + 8, y + (wordsH - doc.heightOfString(amountWordsText, { width: CONTENT_WIDTH - 16 })) / 2, {
      width: CONTENT_WIDTH - 16,
    });
  y += wordsH + 12;

  // ---- Payment Terms ----
  const paymentTermsText = (pi.paymentTerms || "").trim();
  const paymentTermsH = paymentTermsText
    ? doc.font(FONT_BODY).fontSize(8.5).heightOfString(paymentTermsText, { width: CONTENT_WIDTH }) + 10
    : 4;
  ensureSpace(16 + 8 + paymentTermsH);
  sectionBar(doc, MARGIN_LEFT, y, CONTENT_WIDTH, 16, "PAYMENT TERMS");
  y += 16 + 8;
  if (paymentTermsText) {
    doc.fillColor(BLACK).font(FONT_BODY).fontSize(8.5).text(paymentTermsText, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
    y = doc.y + 10;
  } else {
    y += 4;
  }

  // ---- Bank Details / Terms of Delivery, side by side ----
  const colGap = 10;
  const halfW = (CONTENT_WIDTH - colGap) / 2;
  const bankX = MARGIN_LEFT;
  const deliveryX = MARGIN_LEFT + halfW + colGap;

  const bankLines: [string, string][] = [
    ["Beneficiary's Name:", pi.bankBeneficiaryName || "--"],
    ["A/C No.:", pi.bankAccountNumber || "--"],
    ["Bank Name:", pi.bankName || "--"],
    ["SWIFT Code:", pi.bankSwiftCode || "--"],
    ["Bank Address:", pi.bankAddress || "--"],
  ];
  const deliveryLines: [string, string][] = [
    ["Delivery Terms:", pi.deliveryTerms || "--"],
    ["Place of Loading:", pi.placeOfLoading || "--"],
    ["Place of Discharge:", pi.placeOfDischarge || "--"],
    ["Mode & Duration of Shipment:", pi.modeOfShipment || "--"],
  ];

  // Measured first (dry run, no drawing) so we know the box's height before committing to a
  // page for it — drawing straight away could split the box across a page boundary.
  const measureBoxLines = (w: number, lines: [string, string][]) => {
    let h = 8;
    for (const [label, value] of lines) {
      const labelH = doc.font(FONT_BODY_BOLD).fontSize(8.5).heightOfString(label, { width: w - 12 });
      const valueH = doc.font(FONT_BODY).fontSize(8.5).heightOfString(value, { width: w - 12 });
      h += labelH + 1 + valueH + 6;
    }
    return h;
  };
  const boxContentH = Math.max(measureBoxLines(halfW, bankLines), measureBoxLines(halfW, deliveryLines));
  ensureSpace(16 + boxContentH + 12);

  sectionBar(doc, bankX, y, halfW, 16, "BANK DETAILS");
  sectionBar(doc, deliveryX, y, halfW, 16, "TERMS OF DELIVERY");
  const boxTop = y + 16;

  const renderBoxLines = (x: number, w: number, lines: [string, string][]) => {
    let ly = boxTop + 8;
    for (const [label, value] of lines) {
      doc.fillColor(BLACK).font(FONT_BODY_BOLD).fontSize(8.5).text(label, x + 6, ly, { width: w - 12 });
      const labelH = doc.heightOfString(label, { width: w - 12 });
      doc.fillColor(BLACK).font(FONT_BODY).fontSize(8.5).text(value, x + 6, ly + labelH + 1, { width: w - 12 });
      ly = doc.y + 6;
    }
    return ly;
  };
  const bankBottom = renderBoxLines(bankX, halfW, bankLines);
  const deliveryBottom = renderBoxLines(deliveryX, halfW, deliveryLines);
  const boxBottom = Math.max(bankBottom, deliveryBottom);
  doc.rect(bankX, boxTop, halfW, boxBottom - boxTop).stroke(LIGHT_BG);
  doc.rect(deliveryX, boxTop, halfW, boxBottom - boxTop).stroke(LIGHT_BG);
  y = boxBottom + 12;

  // ---- Notes ----
  if (pi.notes) {
    const notesH = doc.font(FONT_BODY).fontSize(8.5).heightOfString(pi.notes, { width: CONTENT_WIDTH });
    ensureSpace(16 + 6 + notesH + 14);
    sectionBar(doc, MARGIN_LEFT, y, CONTENT_WIDTH, 16, "NOTES");
    y += 16 + 6;
    doc.fillColor(BLACK).font(FONT_BODY).fontSize(8.5).text(pi.notes, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
    y = doc.y + 14;
  }

  // ---- Signature line — placed a fixed gap after the preceding content, not pinned to
  // the bottom of the page (pinning it there caused a large blank gap whenever the content
  // above ended well short of the page bottom). ----
  ensureSpace(70 + 35 + 20);
  const sigY = y + 70;
  const sigW = 100;
  if (pi.signatureImage) {
    try {
      doc.image(pi.signatureImage, MARGIN_LEFT, sigY - 35, { fit: [sigW, 35], valign: "bottom" });
    } catch (err) {
      console.error("Failed to embed organization signature image:", err);
    }
  }
  doc.moveTo(MARGIN_LEFT, sigY).lineTo(MARGIN_LEFT + sigW, sigY).strokeColor(BLACK).lineWidth(0.75).stroke();
  doc.fillColor(SIGNATURE_GRAY).font(FONT_BODY_BOLD).fontSize(8).text("Authorized Signatory", MARGIN_LEFT, sigY + 5, { width: 160 });
  if (pi.stampImage) {
    try {
      doc.image(pi.stampImage, MARGIN_LEFT + sigW + 24, sigY - 66, { fit: [82, 82] });
    } catch (err) {
      console.error("Failed to embed organization stamp image:", err);
    }
  }

  return doc;
}

/** Renders the PDF fully in memory — mirrors purchaseOrderPdfBuffer. */
export function proformaInvoicePdfBuffer(pi: ProformaInvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = buildProformaInvoicePdf(pi);
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
