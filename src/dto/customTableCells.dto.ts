/** Shared cell/column-type utilities for this app's "custom spreadsheet tab"
 * features (Plant Report's PlantReportTable/Column/Row, Materials'
 * MaterialTable/Column/Row) — pure, feature-agnostic, no DB access. Each
 * feature has its own Prisma models and controller (they're independent
 * data sets), but the column-dataType vocabulary and cell coercion rules
 * are identical, so that part lives here once instead of drifting between
 * copies. */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type CustomTableColumnDataType = "text" | "number" | "date" | "boolean";
export const VALID_COLUMN_DATA_TYPES = new Set<CustomTableColumnDataType>(["text", "number", "date", "boolean"]);

export type CustomTableCellValue = string | number | boolean | null;

/** Coerces one raw cell value to match its column's declared dataType — an
 * empty/unparseable value becomes null rather than rejecting the whole row,
 * since a partially-filled row is normal for a spreadsheet-style table. */
export function coerceCellValue(value: unknown, dataType: string): CustomTableCellValue {
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
): Record<string, CustomTableCellValue> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, CustomTableCellValue> = {};
  for (const column of columns) {
    const key = String(column.id);
    if (!(key in raw)) continue;
    result[key] = coerceCellValue(raw[key], column.dataType);
  }
  return result;
}
