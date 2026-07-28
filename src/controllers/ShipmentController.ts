import { Response } from "express";
import { prisma } from "../config/prisma";
import { AuthRequest } from "../middlewares/auth";
import {
  AddShipmentDto,
  UpdateShipmentDto,
  AddInsuranceDto,
  UpdateInsuranceDto,
} from "../dto/shipment.dto";
import { AddCustomsDto, UpdateCustomsDto } from "../dto/customs.dto";

/**
 * Shipment / Insurance / Customs (procurement pipeline v2, step 5): Purchase Order ->
 * Proforma Invoice -> Shipment/Insurance/Customs -> Cost Sheet -> Goods Receipt -> Inventory.
 *
 * The same Shipment entity serves both "Local" and "International" purchase types — Local
 * purchases just never get an Insurance/Customs child row. Insurance/Customs are always
 * optional server-side regardless of purchaseOrder.purchaseType; the frontend decides when
 * to show those sections in the UI.
 */
export class ShipmentController {
  /** POST /purchase-orders/:id/shipment — one shipment allowed per purchase order. Admin-gated (see routes.ts). */
  static addShipment = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      transportMode,
      transportCompany,
      containerNo,
      vehicleNo,
      trackingNo,
      etd,
      eta,
      arrivalDate,
      status,
      freightCost,
      loadingCost,
      unloadingCost,
      fuelCost,
      miscellaneousCost,
      localTaxCost,
    }: AddShipmentDto = req.body;

    try {
      const purchaseOrder = await prisma.purchaseOrder.findFirst({
        where: { id: parseInt(id as string), organizationId: req.organization!.id },
        include: { shipment: true },
      });
      if (!purchaseOrder) {
        return res.status(404).json({ message: "Purchase order not found" });
      }
      if (purchaseOrder.shipment) {
        return res.status(400).json({ message: "A shipment already exists for this purchase order" });
      }

      const created = await prisma.shipment.create({
        data: {
          purchaseOrderId: purchaseOrder.id,
          transportMode: transportMode ?? "road",
          status: status ?? "booked",
          ...(transportCompany !== undefined ? { transportCompany } : {}),
          ...(containerNo !== undefined ? { containerNo } : {}),
          ...(vehicleNo !== undefined ? { vehicleNo } : {}),
          ...(trackingNo !== undefined ? { trackingNo } : {}),
          ...(etd ? { etd: new Date(etd) } : {}),
          ...(eta ? { eta: new Date(eta) } : {}),
          ...(arrivalDate ? { arrivalDate: new Date(arrivalDate) } : {}),
          ...(freightCost !== undefined ? { freightCost } : {}),
          ...(loadingCost !== undefined ? { loadingCost } : {}),
          ...(unloadingCost !== undefined ? { unloadingCost } : {}),
          ...(fuelCost !== undefined ? { fuelCost } : {}),
          ...(miscellaneousCost !== undefined ? { miscellaneousCost } : {}),
          ...(localTaxCost !== undefined ? { localTaxCost } : {}),
        },
      });

      const shipmentNo = `SHP-${String(created.id).padStart(6, "0")}`;
      const shipment = await prisma.shipment.update({
        where: { id: created.id },
        data: { shipmentNo },
      });

      return res.status(201).json({ message: "Shipment created", shipment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  private static async loadOwnedShipment(id: string, organizationId: number) {
    const shipment = await prisma.shipment.findFirst({
      where: { id: parseInt(id) },
      include: { purchaseOrder: true, insurance: true, customs: true },
    });
    if (!shipment || shipment.purchaseOrder?.organizationId !== organizationId) return null;
    return shipment;
  }

  /** PUT /shipments/:id — admin-gated. */
  static updateShipment = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      transportMode,
      transportCompany,
      containerNo,
      vehicleNo,
      trackingNo,
      etd,
      eta,
      arrivalDate,
      status,
      freightCost,
      loadingCost,
      unloadingCost,
      fuelCost,
      miscellaneousCost,
      localTaxCost,
    }: UpdateShipmentDto = req.body;

    try {
      const existing = await ShipmentController.loadOwnedShipment(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Shipment not found" });

      const data: any = {};
      if (transportMode !== undefined) data.transportMode = transportMode;
      if (transportCompany !== undefined) data.transportCompany = transportCompany;
      if (containerNo !== undefined) data.containerNo = containerNo;
      if (vehicleNo !== undefined) data.vehicleNo = vehicleNo;
      if (trackingNo !== undefined) data.trackingNo = trackingNo;
      if (etd !== undefined) data.etd = etd ? new Date(etd) : null;
      if (eta !== undefined) data.eta = eta ? new Date(eta) : null;
      if (arrivalDate !== undefined) data.arrivalDate = arrivalDate ? new Date(arrivalDate) : null;
      if (status !== undefined) data.status = status;
      if (freightCost !== undefined) data.freightCost = freightCost;
      if (loadingCost !== undefined) data.loadingCost = loadingCost;
      if (unloadingCost !== undefined) data.unloadingCost = unloadingCost;
      if (fuelCost !== undefined) data.fuelCost = fuelCost;
      if (miscellaneousCost !== undefined) data.miscellaneousCost = miscellaneousCost;
      if (localTaxCost !== undefined) data.localTaxCost = localTaxCost;

      const shipment = await prisma.shipment.update({
        where: { id: existing.id },
        data,
      });

      return res.status(200).json({ message: "Shipment updated", shipment });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /shipments/:id/insurance — optional, "only if applicable". Admin-gated. */
  static addInsurance = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { insuranceCompany, policyNumber, coverage, premium, claimStatus }: AddInsuranceDto = req.body;

    try {
      const shipment = await ShipmentController.loadOwnedShipment(id as string, req.organization!.id);
      if (!shipment) return res.status(404).json({ message: "Shipment not found" });
      if (shipment.insurance) {
        return res.status(400).json({ message: "Insurance already exists for this shipment" });
      }

      const insurance = await prisma.insurance.create({
        data: {
          shipmentId: shipment.id,
          ...(insuranceCompany !== undefined ? { insuranceCompany } : {}),
          ...(policyNumber !== undefined ? { policyNumber } : {}),
          ...(coverage !== undefined ? { coverage } : {}),
          ...(premium !== undefined ? { premium } : {}),
          ...(claimStatus !== undefined ? { claimStatus } : {}),
        },
      });

      return res.status(201).json({ message: "Insurance added", insurance });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  private static async loadOwnedInsurance(id: string, organizationId: number) {
    const insurance = await prisma.insurance.findFirst({
      where: { id: parseInt(id) },
      include: { shipment: { include: { purchaseOrder: true } } },
    });
    if (!insurance || insurance.shipment?.purchaseOrder?.organizationId !== organizationId) return null;
    return insurance;
  }

  /** PUT /insurance/:id — admin-gated. */
  static updateInsurance = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { insuranceCompany, policyNumber, coverage, premium, claimStatus }: UpdateInsuranceDto = req.body;

    try {
      const existing = await ShipmentController.loadOwnedInsurance(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Insurance not found" });

      const data: any = {};
      if (insuranceCompany !== undefined) data.insuranceCompany = insuranceCompany;
      if (policyNumber !== undefined) data.policyNumber = policyNumber;
      if (coverage !== undefined) data.coverage = coverage;
      if (premium !== undefined) data.premium = premium;
      if (claimStatus !== undefined) data.claimStatus = claimStatus;

      const insurance = await prisma.insurance.update({
        where: { id: existing.id },
        data,
      });

      return res.status(200).json({ message: "Insurance updated", insurance });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /shipments/:id/customs — optional, international purchases only (not enforced server-side). Admin-gated. */
  static addCustoms = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      customDeclarationNumber,
      billOfEntry,
      hsCode,
      clearingAgent,
      port,
      importDuty,
      vat,
      excise,
      serviceCharge,
      documentationCost,
      inspectionCost,
      warehouseCost,
      miscellaneousCost,
    }: AddCustomsDto = req.body;

    try {
      const shipment = await ShipmentController.loadOwnedShipment(id as string, req.organization!.id);
      if (!shipment) return res.status(404).json({ message: "Shipment not found" });
      if (shipment.customs) {
        return res.status(400).json({ message: "Customs already exists for this shipment" });
      }

      const customs = await prisma.customs.create({
        data: {
          shipmentId: shipment.id,
          ...(customDeclarationNumber !== undefined ? { customDeclarationNumber } : {}),
          ...(billOfEntry !== undefined ? { billOfEntry } : {}),
          ...(hsCode !== undefined ? { hsCode } : {}),
          ...(clearingAgent !== undefined ? { clearingAgent } : {}),
          ...(port !== undefined ? { port } : {}),
          ...(importDuty !== undefined ? { importDuty } : {}),
          ...(vat !== undefined ? { vat } : {}),
          ...(excise !== undefined ? { excise } : {}),
          ...(serviceCharge !== undefined ? { serviceCharge } : {}),
          ...(documentationCost !== undefined ? { documentationCost } : {}),
          ...(inspectionCost !== undefined ? { inspectionCost } : {}),
          ...(warehouseCost !== undefined ? { warehouseCost } : {}),
          ...(miscellaneousCost !== undefined ? { miscellaneousCost } : {}),
        },
      });

      return res.status(201).json({ message: "Customs added", customs });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  private static async loadOwnedCustoms(id: string, organizationId: number) {
    const customs = await prisma.customs.findFirst({
      where: { id: parseInt(id) },
      include: { shipment: { include: { purchaseOrder: true } } },
    });
    if (!customs || customs.shipment?.purchaseOrder?.organizationId !== organizationId) return null;
    return customs;
  }

  /** PUT /customs/:id — admin-gated. */
  static updateCustoms = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      customDeclarationNumber,
      billOfEntry,
      hsCode,
      clearingAgent,
      port,
      importDuty,
      vat,
      excise,
      serviceCharge,
      documentationCost,
      inspectionCost,
      warehouseCost,
      miscellaneousCost,
    }: UpdateCustomsDto = req.body;

    try {
      const existing = await ShipmentController.loadOwnedCustoms(id as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Customs not found" });

      const data: any = {};
      if (customDeclarationNumber !== undefined) data.customDeclarationNumber = customDeclarationNumber;
      if (billOfEntry !== undefined) data.billOfEntry = billOfEntry;
      if (hsCode !== undefined) data.hsCode = hsCode;
      if (clearingAgent !== undefined) data.clearingAgent = clearingAgent;
      if (port !== undefined) data.port = port;
      if (importDuty !== undefined) data.importDuty = importDuty;
      if (vat !== undefined) data.vat = vat;
      if (excise !== undefined) data.excise = excise;
      if (serviceCharge !== undefined) data.serviceCharge = serviceCharge;
      if (documentationCost !== undefined) data.documentationCost = documentationCost;
      if (inspectionCost !== undefined) data.inspectionCost = inspectionCost;
      if (warehouseCost !== undefined) data.warehouseCost = warehouseCost;
      if (miscellaneousCost !== undefined) data.miscellaneousCost = miscellaneousCost;

      const customs = await prisma.customs.update({
        where: { id: existing.id },
        data,
      });

      return res.status(200).json({ message: "Customs updated", customs });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** POST /customs/:itemId/documents — upload a supporting document. Admin-gated. Expects multer single("file") (uploadCustomsFile, keyed on :itemId) + body.documentType. */
  static addCustomsDocument = async (req: AuthRequest, res: Response) => {
    const { itemId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "A file is required" });
    const documentType = (req.body?.documentType as string) || "other";

    try {
      const existing = await ShipmentController.loadOwnedCustoms(itemId as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Customs not found" });

      const document = await prisma.customsDocument.create({
        data: {
          fileName: file.originalname,
          filePath: file.path.replace(/\\/g, "/").replace(/^uploads\//, ""),
          documentType,
          customsId: existing.id,
        },
      });

      return res.status(201).json({ message: "Document uploaded", document });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };

  /** DELETE /customs/:itemId/documents/:documentId — admin-gated. */
  static deleteCustomsDocument = async (req: AuthRequest, res: Response) => {
    const { itemId, documentId } = req.params;
    try {
      const existing = await ShipmentController.loadOwnedCustoms(itemId as string, req.organization!.id);
      if (!existing) return res.status(404).json({ message: "Customs not found" });

      const document = await prisma.customsDocument.findFirst({
        where: { id: parseInt(documentId as string), customsId: existing.id },
      });
      if (!document) return res.status(404).json({ message: "Document not found" });

      await prisma.customsDocument.delete({ where: { id: document.id } });
      return res.status(200).json({ message: "Document deleted" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  };
}
