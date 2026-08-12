import { PrismaClient } from "@prisma/client";

// Singleton pattern: in dev with tsx watch, the module gets re-evaluated on every change.
// Without this, each reload opens a new DB connection until the pool exhausts.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
