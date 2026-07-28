"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("../generated/prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const database_url_1 = require("./database-url");
dotenv_1.default.config();
const isProduction = process.env.NODE_ENV === "production";
const adapter = new adapter_pg_1.PrismaPg({
    connectionString: (0, database_url_1.getDatabaseUrl)(),
    ssl: isProduction ? { rejectUnauthorized: false } : false,
});
exports.prisma = new client_1.PrismaClient({
    adapter,
    log: isProduction ? [] : ["query", "error", "warn"],
});
//# sourceMappingURL=prisma.js.map