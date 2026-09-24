import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./database-url";
import { invalidateAllAuthUsers, invalidateAuthUser } from "../utils/authCache";

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

const isWrite = (operation: string) => /^(create|update|upsert|delete)/.test(operation);

/**
 * authMiddleware caches each user's memberships/organizations in Redis (see
 * utils/authCache.ts). Any write to the models that cache is built from clears
 * it here, in one place, instead of at every call site — so a role change,
 * removed member, password/tokenVersion bump or renamed organization can't be
 * served stale. User writes that name a single id only clear that user; the
 * rest (memberships, organizations) clear everyone, which is fine because
 * those writes are rare.
 */
export const prisma = basePrisma.$extends({
  query: {
    user: {
      async $allOperations({ operation, args, query }) {
        const result = await query(args);
        if (isWrite(operation)) {
          const id = (args as { where?: { id?: unknown } }).where?.id;
          if (typeof id === "number") await invalidateAuthUser(id);
          else await invalidateAllAuthUsers();
        }
        return result;
      },
    },
    organizationMembership: {
      async $allOperations({ operation, args, query }) {
        const result = await query(args);
        if (isWrite(operation)) await invalidateAllAuthUsers();
        return result;
      },
    },
    organization: {
      async $allOperations({ operation, args, query }) {
        const result = await query(args);
        if (isWrite(operation)) await invalidateAllAuthUsers();
        return result;
      },
    },
  },
});
