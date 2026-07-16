/**
 * Prisma Client singleton (Next.js hot-reload safe).
 * Requer DATABASE_URL no .env e `npx prisma generate`.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** true quando DATABASE_URL está definida (banco disponível) */
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

export default prisma;
