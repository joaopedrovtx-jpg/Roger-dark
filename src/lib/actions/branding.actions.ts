"use server";

import { getSessionUser } from "@/lib/server/auth";
import {
  getBrandingFromDb,
  dbSaveBranding,
} from "@/lib/server/db/admin-branding.service";
import { getBrandingFromStore, getStore } from "@/lib/server/memory-store";

export async function getBrandingAction() {
  try {
    const fromDb = await getBrandingFromDb();
    if (fromDb) return { source: "mysql", ...fromDb };
    return { source: "mock", ...getBrandingFromStore() };
  } catch {
    return { source: "mock", ...getBrandingFromStore() };
  }
}

export async function saveBrandingAction(data: {
  logoUrl: string;
  faviconUrl: string;
  authImageUrl: string;
  banners: Array<{ id: string; imageUrl: string; name: string; linkUrl: string }>;
}) {
  const user = await getSessionUser();
  if (!user?.roles.includes("admin")) {
    return { error: "Acesso restrito a administradores" };
  }

  try {
    if (!data?.logoUrl || !data?.authImageUrl) {
      return { error: "logoUrl e authImageUrl obrigatórios" };
    }

    const fromDb = await dbSaveBranding({
      logoUrl: data.logoUrl,
      faviconUrl: data.faviconUrl || data.logoUrl,
      authImageUrl: data.authImageUrl,
      banners: data.banners.map((b) => ({
        id: b.id,
        imageUrl: b.imageUrl,
        name: b.name ?? "",
        linkUrl: b.linkUrl ?? "",
      })),
    });

    getStore().branding = {
      logoUrl: data.logoUrl,
      faviconUrl: data.faviconUrl || data.logoUrl,
      authImageUrl: data.authImageUrl,
      banners: data.banners,
    };

    if (fromDb) return { source: "mysql", ...fromDb };
    return { source: "mock", ...data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar branding" };
  }
}
