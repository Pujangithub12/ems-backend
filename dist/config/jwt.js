"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Fails fast at startup instead of silently signing/verifying tokens with a
// hardcoded fallback secret that's sitting in source control — if that
// fallback were ever reached in a real deployment, anyone could forge a
// valid session token for any user id.
if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is not set. Refusing to start with an insecure default secret.");
}
exports.JWT_SECRET = process.env.JWT_SECRET;
//# sourceMappingURL=jwt.js.map