"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_SAFETY_TYPE = exports.VALID_RAINFALL = exports.VALID_WEATHER_SLOT = exports.VALID_REPORT_STATUS = exports.VALID_EQUIPMENT_CONDITION = exports.VALID_ITEM_STATUS = void 0;
exports.VALID_ITEM_STATUS = new Set(["ongoing", "completed"]);
exports.VALID_EQUIPMENT_CONDITION = new Set(["working", "idle", "breakdown"]);
exports.VALID_REPORT_STATUS = new Set(["draft", "submitted"]);
exports.VALID_WEATHER_SLOT = new Set(["morning", "afternoon", "evening"]);
exports.VALID_RAINFALL = new Set(["no_rainfall", "light", "moderate", "heavy"]);
exports.VALID_SAFETY_TYPE = new Set(["observation", "incident"]);
//# sourceMappingURL=siteActivity.dto.js.map