import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import { UserRole } from "../types/enums";
import { SaveShipmentTrackingRecordDto } from "../dto/shipmentTracking.dto";
import { buildTablePdf } from "../utils/tablePdf";

const fmtDate = (d: Date | null): string => (d ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "--");

/** Column defs for the export PDF — same columns/order as ShipmentTrackingTab.tsx's table. */
const SHIPMENT_TRACKING_PDF_COLUMNS = [
  { header: "BL Number" },
  { header: "Carrier Name" },
  { header: "Dispatch Date" },
  { header: "ETA" },
  { header: "POL" },
  { header: "POD" },
  { header: "Type of Container" },
  { header: "No. of Container", align: "right" as const },
  { header: "Dispatched From" },
  { header: "Document Status" },
  { header: "Remarks", width: 1.6 },
];

/** Same admin/super_admin/finance gate as the rest of the Finance page (see
 * FinanceController's canViewFinance) — this table is just a second tab on that page. */
const canAccess = (role: string) =>
  role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN || role === UserRole.FINANCE;

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const str = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
};

const shapeFields = (body: SaveShipmentTrackingRecordDto) => ({
  blNumber: str(body.blNumber),
  carrierName: str(body.carrierName),
  dispatchDate: toDate(body.dispatchDate),
  eta: toDate(body.eta),
  pol: str(body.pol),
  pod: str(body.pod),
  containerType: str(body.containerType),
  containerCount:
    body.containerCount != null && Number.isFinite(Number(body.containerCount)) ? Math.trunc(Number(body.containerCount)) : null,
  dispatchedFrom: str(body.dispatchedFrom),
  documentStatus: str(body.documentStatus),
  remarks: str(body.remarks),
});

/** Shipment Tracking log — the Finance page's second tab (org-wide, admin/super_admin/finance
 * only), a freeform operational log for jobs in transit (BL Number/Carrier/Dispatch Date/ETA/
 * POL/POD/Container Type & Count/Dispatched From/Document Status/Remarks).
 * Distinct from the existing per-PurchaseOrder Shipment model (ShipmentController) — that one
 * tracks a single PO's own transport/customs/insurance detail; this is a separate at-a-glance
 * log the procurement team fills in by hand, not tied to any specific PO. */
export class ShipmentTrackingController {
  static list = async (req: AuthRequest, res: Response) => {
    if (!canAccess(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    try {
      const records = await prisma.shipmentTrackingRecord.findMany({
        where: { organizationId: req.organization!.id },
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ records });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /** GET /workspace/shipment-tracking/pdf — the Export button's PDF option. */
  static exportPdf = async (req: AuthRequest, res: Response) => {
    if (!canAccess(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    try {
      const records = await prisma.shipmentTrackingRecord.findMany({
        where: { organizationId: req.organization!.id },
        orderBy: { createdAt: "desc" },
      });

      const doc = buildTablePdf({
        title: "Shipment Tracking",
        organizationName: req.organization!.name,
        columns: SHIPMENT_TRACKING_PDF_COLUMNS,
        rows: records.map((r) => [
          r.blNumber || "--",
          r.carrierName || "--",
          fmtDate(r.dispatchDate),
          fmtDate(r.eta),
          r.pol || "--",
          r.pod || "--",
          r.containerType || "--",
          r.containerCount != null ? String(r.containerCount) : "--",
          r.dispatchedFrom || "--",
          r.documentStatus || "--",
          r.remarks || "--",
        ]),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="shipment-tracking.pdf"`);
      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static create = async (req: AuthRequest, res: Response) => {
    if (!canAccess(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    try {
      const record = await prisma.shipmentTrackingRecord.create({
        data: {
          ...shapeFields(req.body),
          organizationId: req.organization!.id,
          createdById: req.user!.id,
        },
      });
      return res.status(201).json({ message: "Record added", record });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static update = async (req: AuthRequest, res: Response) => {
    if (!canAccess(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    const recordId = parseInt(id as string, 10);
    if (!Number.isInteger(recordId)) return res.status(400).json({ message: "Invalid record id" });

    try {
      const existing = await prisma.shipmentTrackingRecord.findFirst({
        where: { id: recordId, organizationId: req.organization!.id },
      });
      if (!existing) return res.status(404).json({ message: "Record not found" });

      const record = await prisma.shipmentTrackingRecord.update({
        where: { id: existing.id },
        data: shapeFields(req.body),
      });
      return res.status(200).json({ message: "Record updated", record });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  static remove = async (req: AuthRequest, res: Response) => {
    if (!canAccess(req.user!.role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    const recordId = parseInt(id as string, 10);
    if (!Number.isInteger(recordId)) return res.status(400).json({ message: "Invalid record id" });

    try {
      const existing = await prisma.shipmentTrackingRecord.findFirst({
        where: { id: recordId, organizationId: req.organization!.id },
      });
      if (!existing) return res.status(404).json({ message: "Record not found" });

      await prisma.shipmentTrackingRecord.delete({ where: { id: existing.id } });
      return res.status(200).json({ message: "Record deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
