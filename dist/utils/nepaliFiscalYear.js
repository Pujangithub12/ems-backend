"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentNepaliFiscalYearLabel = void 0;
const nepali_date_converter_1 = __importDefault(require("nepali-date-converter"));
/** Nepali fiscal year runs Shrawan 1 -> Ashar end (BS months are zero-based:
 * Baishakh=0 ... Shrawan=3 ... Chaitra=11), which does NOT line up with the BS
 * calendar year (Baishakh 1). So Baishakh/Jestha/Ashar (months 0-2) still
 * belong to the fiscal year that started the previous BS year. */
const currentNepaliFiscalYearLabel = () => {
    const bs = nepali_date_converter_1.default.fromAD(new Date());
    const bsYear = bs.getYear();
    const bsMonth = bs.getMonth();
    const startYear = bsMonth >= 3 ? bsYear : bsYear - 1;
    return `${startYear % 100}/${(startYear + 1) % 100}`;
};
exports.currentNepaliFiscalYearLabel = currentNepaliFiscalYearLabel;
//# sourceMappingURL=nepaliFiscalYear.js.map