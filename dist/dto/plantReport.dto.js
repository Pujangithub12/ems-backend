"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_COLUMN_DATA_TYPES = exports.ValidationError = void 0;
exports.coerceCellValue = coerceCellValue;
exports.coerceRowValues = coerceRowValues;
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
exports.VALID_COLUMN_DATA_TYPES = new Set(["text", "number", "date", "boolean"]);
/** Coerces one raw cell value to match its column's declared dataType — an
 * empty/unparseable value becomes null rather than rejecting the whole row,
 * since a partially-filled row is normal for a spreadsheet-style table. */
function coerceCellValue(value, dataType) {
    if (value === null || value === undefined || value === "")
        return null;
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
function coerceRowValues(columns, raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const result = {};
    for (const column of columns) {
        const key = String(column.id);
        if (!(key in raw))
            continue;
        result[key] = coerceCellValue(raw[key], column.dataType);
    }
    return result;
}
//# sourceMappingURL=plantReport.dto.js.map