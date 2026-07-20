/**
 * Prisma Client singleton (Next.js hot-reload safe).
 * Requer DATABASE_URL no .env e `npx prisma generate`.
 *
 * Inclui “geração” do client no global: se o schema mudar (ex.: secretKeyEnc)
 * e o process continuar com client antigo, `prisma generate` + restart limpa.
 * Em dev, recria o client quando PRISMA_CLIENT_VERSION do pacote muda.
 */

import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaFieldSig?: string;
};

/** Assinatura leve dos campos de ApiCredential — detecta client desatualizado */
function apiCredentialFieldSig(): string {
  try {
    const model = Prisma.dmmf.datamodel.models.find(
      (m) => m.name === "ApiCredential"
    );
    return (model?.fields.map((f) => f.name).join(",") ?? "") || "none";
  } catch {
    return "err";
  }
}

function makeClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

const fieldSig = apiCredentialFieldSig();
if (
  globalForPrisma.prisma &&
  globalForPrisma.prismaFieldSig &&
  globalForPrisma.prismaFieldSig !== fieldSig
) {
  // Schema do client mudou (generate) — descarta singleton velho
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaFieldSig = fieldSig;
}

/** true quando DATABASE_URL está definida (banco disponível) */
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

export default prisma;
