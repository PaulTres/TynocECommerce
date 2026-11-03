import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const directUrl = process.env.DIRECT_URL;

/**
 * Owner-only Prisma client for local/admin tooling. Runtime repositories use
 * the Neon Data API so no database connection string is needed by the app.
 */
if (!directUrl)
    throw new Error("DIRECT_URL is required for the owner-only Prisma client");

export const db =
    globalForPrisma.prisma ??
    new PrismaClient({
        datasources: { db: { url: directUrl } },
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
