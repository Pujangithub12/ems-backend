import { CustomsDocumentType } from "../types/domain";

/** Body shape for POST /shipments/:id/customs — international purchases only. */
export interface AddCustomsDto {
  customDeclarationNumber?: string;
  billOfEntry?: string;
  hsCode?: string;
  clearingAgent?: string;
  port?: string;
  importDuty?: number;
  vat?: number;
  excise?: number;
  serviceCharge?: number;
  documentationCost?: number;
  inspectionCost?: number;
  warehouseCost?: number;
  miscellaneousCost?: number;
}

/** Body shape for PUT /customs/:id. */
export type UpdateCustomsDto = Partial<AddCustomsDto>;

/** Query/body metadata accompanying the multipart upload for POST /customs/:id/documents. */
export interface AddCustomsDocumentMetaDto {
  documentType?: CustomsDocumentType;
}
