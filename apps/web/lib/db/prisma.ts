import "server-only";
import { PrismaClient } from "@prisma/client";

// Singleton: hot reload would otherwise open a new connection per rebuild.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
