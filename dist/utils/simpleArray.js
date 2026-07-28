"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSimpleArray = toSimpleArray;
exports.fromSimpleArray = fromSimpleArray;
/**
 * TypeORM's `simple-array` column type stored a string[] as a single
 * comma-joined text column and (de)serialized it transparently. Prisma has
 * no equivalent column type, so every read/write site for one of these
 * columns (Task.files, Announcement.targetEmails) must convert explicitly —
 * these two helpers reproduce TypeORM's exact behavior (empty/null -> [],
 * joined with a plain comma, no escaping).
 */
function toSimpleArray(value) {
    if (!value)
        return [];
    return value.split(",").filter((v) => v.length > 0);
}
function fromSimpleArray(value) {
    if (!value || value.length === 0)
        return "";
    return value.join(",");
}
//# sourceMappingURL=simpleArray.js.map