import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "./database-url";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

export const prisma = new PrismaClient({
  adapter,
  log: isProduction ? [] : ["error", "warn"],
});
