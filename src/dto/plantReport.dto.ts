// Cell/column-type vocabulary and coercion rules are shared with Materials'
// identical custom-spreadsheet-tab mechanic — see customTableCells.dto.ts.
// Re-exported here (rather than having every caller import from both files)
// so nothing that already imports these names from plantReport.dto.ts needs
// to change.
export {
  ValidationError,
  VALID_COLUMN_DATA_TYPES,
  coerceCellValue,
  coerceRowValues,
  type CustomTableCellValue,
} from "./customTableCells.dto";
import type { CustomTableColumnDataType, CustomTableCellValue } from "./customTableCells.dto";

export type PlantReportColumnDataType = CustomTableColumnDataType;

/** Body shape for POST /plant-report-tables and PUT /plant-report-tables/:id. */
export interface SavePlantReportTableDto {
  name: string;
}

/** Body shape for POST /plant-report-tables/:id/columns and PUT /plant-report-columns/:id. */
export interface SavePlantReportColumnDto {
  name: string;
  dataType: PlantReportColumnDataType;
  /** Optional flat expected/target value — see PlantReportColumn.target. */
  target?: number | null;
}

/** Body shape for POST /plant-report-tables/:id/rows and PUT /plant-report-rows/:id. */
export interface SavePlantReportRowDto {
  values?: Record<string, unknown>;
}

/** Body shape for POST /plant-report-tables/:id/import — a spreadsheet
 * (CSV/Excel) parsed and matched to this table's *existing* columns
 * client-side (by header name), then keyed by column id exactly like
 * `SavePlantReportRowDto.values` — import never creates columns, so there's
 * nothing here but rows to bulk-insert via the same `coerceRowValues` path
 * a single manual row create/update already uses. */
export interface SaveImportSheetDto {
  rows: Record<string, unknown>[];
}

export type PlantReportCellValue = CustomTableCellValue;
