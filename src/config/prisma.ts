import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./database-url";
import { onModelWrite } from "../utils/cacheInvalidation";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

const basePrisma = new PrismaClient({
  adapter,
  log: isProduction ? [] : ["error", "warn"],
});

/**
 * One hook for every model: after any write, clear the Redis entries built from
 * that model — the per-user auth cache (utils/authCache.ts) and cached GET
 * responses (middlewares/responseCache.ts). The model -> cache mapping lives in
 * utils/cacheInvalidation.ts, so controllers never invalidate by hand and a new
 * write path can't forget to.
 */
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        await onModelWrite(model, operation, args);
        return result;
      },
    },
  },
});
