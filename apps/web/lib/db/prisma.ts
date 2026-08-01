import "server-only";
import { PrismaClient } from "@prisma/client";

// Singleton: in dev, hot-reload-ul ar crea altfel o conexiune noua la fiecare
// recompilare.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
