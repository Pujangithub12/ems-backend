import PDFDocument from "pdfkit";

/** Generic "export this data table as a professional-looking report" PDF — used by the Finance
 * cost-breakdown and Shipment Tracking export buttons. Deliberately simpler than
 * purchaseOrderPdf.ts's letterhead-matching layout (no embedded fonts/signature blocks needed
 * for a data export): a navy header band, a zebra-striped bordered table with a repeating
 * header row across pages, and a page-number footer. */

export interface TablePdfColumn {
  header: string;
  /** Relative width weight — defaults to 1, so columns split the page evenly unless given a
   * larger weight (e.g. a Remarks column that needs more room than a short numeric one). */
  width?: number;
  align?: "left" | "right" | "center";
}

export interface TablePdfOptions {
  title: string;
  subtitle?: string | null;
  organizationName?: string | null;
  columns: TablePdfColumn[];
  rows: string[][];
  generatedAt?: Date;
}

const NAVY = "#1B3E6B";
const HEADER_TEXT = "#FFFFFF";
const STRIPE_BG = "#F3F6FB";
const BORDER = "#D9E2EC";
const TEXT_DARK = "#1E293B";
const TEXT_MUTED = "#64748B";

const PAGE_MARGIN = 36;
const HEADER_ROW_HEIGHT = 24;
const ROW_HEIGHT = 20;
const FONT_SIZE = 8.5;

/** Builds the PDF document — callers either `.pipe(res)` it directly for a live download, same
 * convention as purchaseOrderPdfBuffer/buildPurchaseOrderPdf. */
export function buildTablePdf(options: TablePdfOptions): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
  });

  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const totalWeight = options.columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  const colWidths = options.columns.map((c) => (contentWidth * (c.width ?? 1)) / totalWeight);

  let pageNum = 1;

  const drawReportHeader = (): number => {
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text(options.organizationName || "Report", PAGE_MARGIN, PAGE_MARGIN);
    doc.fillColor(TEXT_DARK).font("Helvetica-Bold").fontSize(11.5).text(options.title, PAGE_MARGIN, PAGE_MARGIN + 19);
    const generated = options.generatedAt ?? new Date();
    doc
      .fillColor(TEXT_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(`Generated on ${generated.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, PAGE_MARGIN, PAGE_MARGIN + 1, {
        width: contentWidth,
        align: "right",
      });

    let nextY = PAGE_MARGIN + 34;
    if (options.subtitle) {
      doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(9).text(options.subtitle, PAGE_MARGIN, nextY);
      nextY += 14;
    }

    doc.moveTo(PAGE_MARGIN, nextY).lineTo(PAGE_MARGIN + contentWidth, nextY).lineWidth(1.5).strokeColor(NAVY).stroke();
    return nextY + 12;
  };

  const drawTableHeaderRow = (y: number): number => {
    doc.rect(PAGE_MARGIN, y, contentWidth, HEADER_ROW_HEIGHT).fill(NAVY);
    let x = PAGE_MARGIN;
    doc.font("Helvetica-Bold").fontSize(FONT_SIZE).fillColor(HEADER_TEXT);
    options.columns.forEach((col, i) => {
      doc.text(col.header, x + 4, y + 8, { width: colWidths[i]! - 8, align: col.align ?? "left" });
      x += colWidths[i]!;
    });
    return y + HEADER_ROW_HEIGHT;
  };

  const drawFooter = () => {
    doc
      .fillColor(TEXT_MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(`Page ${pageNum}`, PAGE_MARGIN, doc.page.height - PAGE_MARGIN + 8, { width: contentWidth, align: "center" });
  };

  let y = drawTableHeaderRow(drawReportHeader());
  const bottomLimit = doc.page.height - PAGE_MARGIN - 8;

  options.rows.forEach((row, rowIndex) => {
    if (y + ROW_HEIGHT > bottomLimit) {
      drawFooter();
      doc.addPage();
      pageNum += 1;
      y = drawTableHeaderRow(PAGE_MARGIN);
    }
    if (rowIndex % 2 === 1) {
      doc.rect(PAGE_MARGIN, y, contentWidth, ROW_HEIGHT).fill(STRIPE_BG);
    }
    let x = PAGE_MARGIN;
    doc.font("Helvetica").fontSize(FONT_SIZE).fillColor(TEXT_DARK);
    row.forEach((cell, i) => {
      doc.text(cell ?? "", x + 4, y + 6, { width: colWidths[i]! - 8, align: options.columns[i]?.align ?? "left" });
      x += colWidths[i]!;
    });
    doc.moveTo(PAGE_MARGIN, y + ROW_HEIGHT).lineTo(PAGE_MARGIN + contentWidth, y + ROW_HEIGHT).lineWidth(0.5).strokeColor(BORDER).stroke();
    y += ROW_HEIGHT;
  });

  if (options.rows.length === 0) {
    doc.fillColor(TEXT_MUTED).font("Helvetica").fontSize(10).text("No data to show.", PAGE_MARGIN, y + 16);
  }

  drawFooter();
  return doc;
}
