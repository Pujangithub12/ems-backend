"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabaseUrl = getDatabaseUrl;
/**
 * Resolves the Postgres connection string the same way TypeORM's data-source.ts
 * used to: a single DATABASE_URL env var if set, otherwise built from the
 * discrete DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE vars. Shared by
 * the app's Prisma client (src/config/prisma.ts) and by prisma.config.ts (CLI
 * commands like `prisma db pull`/`migrate`), so both resolve the same way.
 */
function getDatabaseUrl() {
    if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }
    const host = process.env.DB_HOST || "localhost";
    const port = process.env.DB_PORT || "5432";
    const username = process.env.DB_USERNAME || "postgres";
    const password = process.env.DB_PASSWORD || "";
    const database = process.env.DB_DATABASE || "ems";
    return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}
//# sourceMappingURL=database-url.js.map