// Cell/column-type vocabulary and coercion rules are shared with Plant
// Report's identical custom-spreadsheet-tab mechanic — see customTableCells.dto.ts.
export {
  ValidationError,
  VALID_COLUMN_DATA_TYPES,
  coerceCellValue,
  coerceRowValues,
  type CustomTableCellValue,
} from "./customTableCells.dto";
import type { CustomTableColumnDataType, CustomTableCellValue } from "./customTableCells.dto";

export type MaterialCustomColumnDataType = CustomTableColumnDataType;

/** Body shape for POST /material-custom-tables and PUT /material-custom-tables/:id. */
export interface SaveMaterialCustomTableDto {
  name: string;
}

/** Body shape for POST /material-custom-tables/:id/columns and PUT /material-custom-columns/:id. */
export interface SaveMaterialCustomColumnDto {
  name: string;
  dataType: MaterialCustomColumnDataType;
  target?: number | null;
}

/** Body shape for POST /material-custom-tables/:id/rows and PUT /material-custom-rows/:id. */
export interface SaveMaterialCustomRowDto {
  values?: Record<string, unknown>;
}

/** Body shape for POST /material-custom-tables/:id/import. */
export interface SaveMaterialCustomImportSheetDto {
  rows: Record<string, unknown>[];
}

export type MaterialCustomCellValue = CustomTableCellValue;
