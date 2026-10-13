import PDFDocument from "pdfkit";

/** The Finance cost-breakdown "Export as PDF" — a branded statement (letterhead, record details
 * panel, status panel, navy-header table with a totals row, summary cards, notes and a signature
 * block) rather than the plain data dump tablePdf.ts produces. Landscape A4, since the cost
 * breakdown has far more columns than fit on a portrait page. */

export interface StatementColumn {
  header: string;
  /** Relative width weight (defaults to 1). */
  width?: number;
  align?: "left" | "right" | "center";
}

export interface StatementRowCell {
  text: string;
  /** Optional text colour override (e.g. amber for an outstanding refund). */
  color?: string;
}

export interface CostBreakdownStatementData {
  organizationName: string;
  organizationTagline?: string | null;
  organizationAddress?: string | null;
  organizationContact?: string | null;
  organizationEmail?: string | null;
  logoImage?: Buffer | null;
  signatureImage?: Buffer | null;

  title: string;
  subtitle: string;
  generatedAt?: Date;

  /** Left "details" panel, label/value pairs. */
  details: { label: string; value: string }[];
  /** Right "status" panel. */
  statusLabel: string;
  statusTone: "good" | "warn";
  statusRows: { label: string; value: string }[];

  columns: StatementColumn[];
  rows: StatementRowCell[][];
  /** Same length as `columns`; rendered as a bold totals row. */
  totalsRow: string[];

  /** Bottom summary cards (up to 4); the last may carry a 0-100 progress bar. */
  summary: { label: string; value: string; caption?: string; progress?: number }[];
  notes: string[];
}

const NAVY = "#1B3E6B";
const NAVY_DARK = "#22406E";
const PANEL_BG = "#EEF3FA";
const STRIPE_BG = "#F5F8FC";
const BORDER = "#D9E2EC";
const TEXT_DARK = "#1E293B";
const TEXT_MUTED = "#64748B";
const GOOD_BG = "#D6F0DF";
const GOOD_TEXT = "#1F7A45";
const WARN_BG = "#FDEBC8";
const WARN_TEXT = "#9A5B05";

const MARGIN = 32;
const HEADER_ROW_HEIGHT = 30;
const ROW_HEIGHT = 22;
const FONT_SIZE = 7.5;
const MIN_FONT_SIZE = 5;

export function buildCostBreakdownStatementPdf(data: CostBreakdownStatementData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  const W = doc.page.width - MARGIN * 2;
  const bottomLimit = () => doc.page.height - MARGIN - 14;
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit()) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ---- Letterhead ----
  const logoSize = 44;
  let textX = MARGIN;
  if (data.logoImage) {
    try {
      doc.image(data.logoImage, MARGIN, y, { fit: [logoSize, logoSize] });
      textX = MARGIN + logoSize + 12;
    } catch {
      /* unreadable image — fall back to the drawn mark below */
    }
  }
  if (textX === MARGIN) {
    // No logo uploaded: a simple three-bar mark in the brand navy.
    doc.rect(MARGIN, y + 14, 10, 26).fill(NAVY);
    doc.rect(MARGIN + 14, y + 4, 10, 36).fill(NAVY_DARK);
    doc.rect(MARGIN + 28, y + 9, 10, 31).fill(NAVY);
    textX = MARGIN + 52;
  }
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(data.organizationName, textX, y + 2, { width: W * 0.6, lineBreak: false });
  if (data.organizationTagline) {
    doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(9.5).text(data.organizationTagline, textX, y + 28, { width: W * 0.6, lineBreak: false });
  }
  const contactLines = [data.organizationAddress, data.organizationContact, data.organizationEmail].filter(Boolean) as string[];
  let cy = y + 2;
  doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5);
  contactLines.forEach((line) => {
    doc.text(line, MARGIN + W * 0.6, cy, { width: W * 0.4, align: "right", lineBreak: false });
    cy += 12;
  });
  y += 56;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + W, y).lineWidth(1.5).strokeColor(NAVY).stroke();
  y += 16;

  // ---- Title block ----
  const generated = data.generatedAt ?? new Date();
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(24).text(data.title, MARGIN, y, { width: W * 0.62, lineBreak: false });
  doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(10).text(data.subtitle, MARGIN, y + 32, { width: W * 0.62, lineBreak: false });
  const metaX = MARGIN + W * 0.66;
  doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(9.5).text("Generated On", metaX, y + 6, { width: 90, lineBreak: false });
  doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(10).text(
    `${generated.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}  ${generated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
    metaX + 92,
    y + 5,
    { width: W * 0.34 - 92, align: "right", lineBreak: false },
  );
  y += 54;

  // ---- Details / status panel ----
  const detailRowH = 15;
  const panelH = Math.max(data.details.length, data.statusRows.length + 1) * detailRowH + 34;
  ensureSpace(panelH + 10);
  doc.roundedRect(MARGIN, y, W, panelH, 6).fill(PANEL_BG);
  const splitX = MARGIN + W * 0.62;
  doc.moveTo(splitX, y + 14).lineTo(splitX, y + panelH - 14).lineWidth(0.75).strokeColor(BORDER).stroke();

  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("Record Details", MARGIN + 18, y + 14, { lineBreak: false });
  data.details.forEach((d, i) => {
    const ry = y + 34 + i * detailRowH;
    doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(8.5).text(d.label, MARGIN + 18, ry, { width: 120, lineBreak: false });
    doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5).text(d.value || "--", MARGIN + 150, ry, { width: splitX - MARGIN - 170, lineBreak: false, ellipsis: true });
  });

  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("Current Status", splitX + 18, y + 14, { lineBreak: false });
  const badgeBg = data.statusTone === "good" ? GOOD_BG : WARN_BG;
  const badgeText = data.statusTone === "good" ? GOOD_TEXT : WARN_TEXT;
  const badgeW = doc.font("Helvetica-Bold").fontSize(8).widthOfString(data.statusLabel) + 20;
  doc.roundedRect(splitX + 130, y + 12, badgeW, 16, 8).fill(badgeBg);
  doc.fillColor(badgeText).font("Helvetica-Bold").fontSize(8).text(data.statusLabel, splitX + 130, y + 16.5, { width: badgeW, align: "center", lineBreak: false });
  data.statusRows.forEach((d, i) => {
    const ry = y + 38 + i * (detailRowH + 4);
    doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5).text(d.label, splitX + 18, ry, { width: 120, lineBreak: false });
    doc.fillColor(TEXT_DARK).font("Helvetica-Bold").fontSize(9).text(d.value, splitX + 130, ry, { width: MARGIN + W - splitX - 148, lineBreak: false });
  });
  y += panelH + 18;

  // ---- Table ----
  ensureSpace(HEADER_ROW_HEIGHT + ROW_HEIGHT * 2 + 24);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(13).text("Cost Breakdown", MARGIN, y, { lineBreak: false });
  y += 22;

  /** Shrinks the font (down to MIN_FONT_SIZE) so a single unbreakable token fits `maxW`. */
  const fitSize = (text: string, maxW: number, font: string, base = FONT_SIZE, wholeLine = false): number => {
    doc.font(font).fontSize(base);
    const widest = wholeLine ? doc.widthOfString(text) : Math.max(...text.split(/\s+/).map((w) => doc.widthOfString(w)), 0);
    return widest > maxW ? Math.max(MIN_FONT_SIZE, (base * maxW) / widest) : base;
  };

  const totalWeight = data.columns.reduce((s, c) => s + (c.width ?? 1), 0);
  const colW = data.columns.map((c) => (W * (c.width ?? 1)) / totalWeight);

  const drawHeaderRow = () => {
    doc.rect(MARGIN, y, W, HEADER_ROW_HEIGHT).fill(NAVY_DARK);
    let x = MARGIN;
    data.columns.forEach((c, i) => {
      doc.font("Helvetica-Bold").fontSize(fitSize(c.header, colW[i]! - 6, "Helvetica-Bold")).fillColor("#FFFFFF");
      doc.text(c.header, x + 3, y + 5, { width: colW[i]! - 6, height: HEADER_ROW_HEIGHT - 6, align: c.align ?? "left" });
      x += colW[i]!;
    });
    y += HEADER_ROW_HEIGHT;
  };
  drawHeaderRow();

  const drawRow = (cells: StatementRowCell[], index: number) => {
    if (y + ROW_HEIGHT > bottomLimit()) {
      doc.addPage();
      y = MARGIN;
      drawHeaderRow();
    }
    if (index % 2 === 1) doc.rect(MARGIN, y, W, ROW_HEIGHT).fill(STRIPE_BG);
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const w = colW[i]! - 6;
      const numeric = data.columns[i]?.align === "right";
      // Short values (dates, LC numbers) stay on one line, shrunk to fit; long text (item names,
      // remarks) wraps onto a second line before truncating.
      const singleLine = numeric || cell.text.length <= 14;
      const size = fitSize(cell.text, w, "Helvetica", FONT_SIZE, singleLine);
      // Numbers stay on one line (font shrinks to fit); text wraps to a second line before truncating.
      doc.fillColor(cell.color ?? TEXT_DARK).font("Helvetica").fontSize(size).text(cell.text, x + 3, y + (singleLine ? 7 : 3), {
        width: w,
        height: singleLine ? ROW_HEIGHT - 8 : ROW_HEIGHT - 3,
        align: data.columns[i]?.align ?? "left",
        ellipsis: true,
      });
      x += colW[i]!;
    });
    doc.moveTo(MARGIN, y + ROW_HEIGHT).lineTo(MARGIN + W, y + ROW_HEIGHT).lineWidth(0.5).strokeColor(BORDER).stroke();
    y += ROW_HEIGHT;
  };

  if (data.rows.length === 0) {
    doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(10).text("No lines to show.", MARGIN, y + 10);
    y += 34;
  } else {
    data.rows.forEach(drawRow);
    // Totals row
    if (y + ROW_HEIGHT > bottomLimit()) {
      doc.addPage();
      y = MARGIN;
      drawHeaderRow();
    }
    doc.rect(MARGIN, y, W, ROW_HEIGHT).fill(PANEL_BG);
    let x = MARGIN;
    data.totalsRow.forEach((text, i) => {
      const size = fitSize(text, colW[i]! - 6, "Helvetica-Bold");
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(size).text(text, x + 3, y + 7, {
        width: colW[i]! - 6,
        height: ROW_HEIGHT - 8,
        align: data.columns[i]?.align ?? "left",
        ellipsis: true,
      });
      x += colW[i]!;
    });
    doc.rect(MARGIN, y, W, ROW_HEIGHT).lineWidth(0.75).strokeColor(BORDER).stroke();
    y += ROW_HEIGHT + 18;
  }

  // ---- Summary cards ----
  if (data.summary.length > 0) {
    const cardH = 60;
    ensureSpace(cardH + 10);
    doc.roundedRect(MARGIN, y, W, cardH, 6).fill(PANEL_BG);
    const cardW = W / data.summary.length;
    data.summary.forEach((c, i) => {
      const cx = MARGIN + i * cardW;
      if (i > 0) doc.moveTo(cx, y + 12).lineTo(cx, y + cardH - 12).lineWidth(0.75).strokeColor(BORDER).stroke();
      doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5).text(c.label, cx + 18, y + 10, { width: cardW - 30, lineBreak: false });
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(13).text(c.value, cx + 18, y + 24, { width: cardW - 30, lineBreak: false });
      if (c.progress != null) {
        const barW = cardW - 40;
        doc.roundedRect(cx + 18, y + 46, barW, 5, 2.5).fill("#D3DCE8");
        const filled = Math.max(0, Math.min(100, c.progress)) / 100;
        if (filled > 0) doc.roundedRect(cx + 18, y + 46, barW * filled, 5, 2.5).fill(NAVY);
      } else if (c.caption) {
        doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(8).text(c.caption, cx + 18, y + 44, { width: cardW - 30, lineBreak: false });
      }
    });
    y += cardH + 18;
  }

  // ---- Notes + signature ----
  const sigH = 84;
  ensureSpace(sigH + 6);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10.5).text("Notes", MARGIN, y, { lineBreak: false });
  let ny = y + 18;
  doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8);
  data.notes.forEach((n) => {
    doc.text(`•  ${n}`, MARGIN + 6, ny, { width: W * 0.6, lineBreak: false });
    ny += 12;
  });

  const sigX = MARGIN + W * 0.72;
  const sigW = W * 0.28;
  doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5).text(`For ${data.organizationName}`, sigX, y, { width: sigW, align: "center", lineBreak: false });
  if (data.signatureImage) {
    try {
      doc.image(data.signatureImage, sigX + sigW / 2 - 55, y + 12, { fit: [110, 34] });
    } catch {
      /* ignore an unreadable signature image */
    }
  }
  doc.moveTo(sigX, y + 52).lineTo(sigX + sigW, y + 52).lineWidth(0.75).strokeColor(TEXT_MUTED).stroke();
  doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5).text("Authorized Signatory", sigX, y + 57, { width: sigW, align: "center", lineBreak: false });
  doc.text("Finance Department", sigX, y + 69, { width: sigW, align: "center", lineBreak: false });

  // ---- Page numbers ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // The page number sits inside the bottom margin; drop it so pdfkit doesn't paginate for it.
    doc.page.margins.bottom = 0;
    doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(8).text(`Page ${i + 1} of ${range.count}`, MARGIN, doc.page.height - MARGIN + 6, {
      width: W,
      align: "center",
      lineBreak: false,
    });
  }

  return doc;
}
