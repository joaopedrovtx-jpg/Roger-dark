import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function dbAvailable(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function audit(
  action: string,
  entityType?: string,
  entityId?: string,
  meta?: unknown
) {
  if (!(await dbAvailable())) return;
  try {
    await prisma.auditLog.create({
      data: {
        id: newId("aud"),
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        meta: meta ? (meta as object) : undefined,
      },
    });
  } catch { /* ignore */ }
}

export async function getBrandingFromDb() {
  if (!(await dbAvailable())) return null;
  const b = await prisma.branding.findUnique({ where: { id: "default" } });
  if (!b) return null;
  const banners = await prisma.brandBanner.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return {
    logoUrl: b.logoUrl,
    faviconUrl: b.faviconUrl,
    authImageUrl: b.authImageUrl,
    banners: banners.map((x) => ({
      id: x.id,
      imageUrl: x.imageUrl,
      name: x.name,
      linkUrl: x.linkUrl,
    })),
  };
}

export async function dbSaveBranding(input: {
  logoUrl: string;
  faviconUrl: string;
  authImageUrl: string;
  banners: Array<{
    id: string;
    imageUrl: string;
    name: string;
    linkUrl: string;
  }>;
}) {
  if (!(await dbAvailable())) return null;
  await prisma.branding.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      logoUrl: input.logoUrl,
      faviconUrl: input.faviconUrl,
      authImageUrl: input.authImageUrl,
    },
    update: {
      logoUrl: input.logoUrl,
      faviconUrl: input.faviconUrl,
      authImageUrl: input.authImageUrl,
    },
  });
  await prisma.brandBanner.deleteMany({});
  if (input.banners.length) {
    await prisma.brandBanner.createMany({
      data: input.banners.map((b, i) => ({
        id: b.id || newId("ban"),
        imageUrl: b.imageUrl,
        name: b.name ?? "",
        linkUrl: b.linkUrl ?? "",
        sortOrder: i,
        active: true,
      })),
    });
  }
  await audit("branding.save", "branding", "default");
  return getBrandingFromDb();
}
