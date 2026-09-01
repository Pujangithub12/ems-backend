export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type PlantReportColumnDataType = "text" | "number" | "date" | "boolean";
export const VALID_COLUMN_DATA_TYPES = new Set<PlantReportColumnDataType>(["text", "number", "date", "boolean"]);

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
 * (CSV/Excel) parsed client-side into a header list + row objects keyed by
 * header name (not column id, since a new header may not have a column yet). */
export interface SaveImportSheetDto {
  columns: { name: string; dataType: PlantReportColumnDataType }[];
  rows: Record<string, unknown>[];
}

export type PlantReportCellValue = string | number | boolean | null;

/** Coerces one raw cell value to match its column's declared dataType — an
 * empty/unparseable value becomes null rather than rejecting the whole row,
 * since a partially-filled row is normal for a spreadsheet-style table. */
export function coerceCellValue(value: unknown, dataType: string): PlantReportCellValue {
  if (value === null || value === undefined || value === "") return null;
  switch (dataType) {
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      return Boolean(value);
    case "date": {
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    }
    case "text":
    default:
      return String(value).trim() || null;
  }
}

/** Validates+coerces a row's `values` payload against a table's real
 * columns: drops any key that isn't a real column id for this table, and
 * coerces the rest per-column to match its dataType. */
export function coerceRowValues(
  columns: { id: number; dataType: string }[],
  raw: Record<string, unknown> | undefined,
): Record<string, PlantReportCellValue> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, PlantReportCellValue> = {};
  for (const column of columns) {
    const key = String(column.id);
    if (!(key in raw)) continue;
    result[key] = coerceCellValue(raw[key], column.dataType);
  }
  return result;
}
