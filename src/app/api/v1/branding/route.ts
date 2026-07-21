import { NextResponse } from "next/server";
import { getBrandingFromStore, getStore } from "@/lib/server/memory-store";
import type { PlatformBranding } from "@/lib/domain/types";
import {
  dbSaveBranding,
  getBrandingFromDb,
} from "@/lib/server/db/admin-branding.service";
import { isGuardFail, requireStaffPermission } from "@/lib/server/guards";
import { validateAssetUrl } from "@/lib/server/asset-url";

export async function GET() {
  try {
    const fromDb = await getBrandingFromDb();
    if (fromDb) {
      return NextResponse.json({ source: "mysql", ...fromDb });
    }
    return NextResponse.json({ source: "mock", ...getBrandingFromStore() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/v1/branding staff com personalização */
export async function PUT(req: Request) {
  const gate = await requireStaffPermission(req, "personalizacao");
  if (isGuardFail(gate)) return gate.error;

  try {
    const body = (await req.json()) as PlatformBranding;
    if (!body?.logoUrl || !body?.authImageUrl) {
      return NextResponse.json(
        { error: "logoUrl e authImageUrl obrigatórios" },
        { status: 400 }
      );
    }

    // DP-V3-08: validar todas as URLs externas (mitiga SSRF latente)
    const checkUrl = (field: string, value: unknown): string | null => {
      const v = validateAssetUrl(value);
      if (!v.ok) {
        return `URL inválida em ${field}: ${v.reason}`;
      }
      return v.url;
    };

    const logoUrl = checkUrl("logoUrl", body.logoUrl);
    if (!logoUrl) {
      return NextResponse.json({ error: "URL inválida em logoUrl" }, { status: 400 });
    }
    const authImageUrl = checkUrl("authImageUrl", body.authImageUrl);
    if (!authImageUrl) {
      return NextResponse.json({ error: "URL inválida em authImageUrl" }, { status: 400 });
    }
    const faviconUrl = body.faviconUrl
      ? checkUrl("faviconUrl", body.faviconUrl)
      : logoUrl;
    if (body.faviconUrl && !faviconUrl) {
      return NextResponse.json({ error: "URL inválida em faviconUrl" }, { status: 400 });
    }

    const banners: Array<{
      id: string;
      imageUrl: string;
      name: string;
      linkUrl: string;
    }> = [];
    if (Array.isArray(body.banners)) {
      for (let i = 0; i < body.banners.length; i++) {
        const b = body.banners[i];
        if (!b?.imageUrl) continue;
        const img = checkUrl(`banners[${i}].imageUrl`, b.imageUrl);
        if (!img) {
          return NextResponse.json(
            { error: `URL inválida em banners[${i}].imageUrl` },
            { status: 400 }
          );
        }
        let link = "";
        if (b.linkUrl) {
          const l = checkUrl(`banners[${i}].linkUrl`, b.linkUrl);
          if (!l) {
            return NextResponse.json(
              { error: `URL inválida em banners[${i}].linkUrl` },
              { status: 400 }
            );
          }
          link = l;
        }
        banners.push({
          id: String(b.id ?? ""),
          imageUrl: img,
          name: (b.name ?? "").slice(0, 80),
          linkUrl: link,
        });
      }
    }

    const fromDb = await dbSaveBranding({
      logoUrl,
      faviconUrl: faviconUrl || logoUrl,
      authImageUrl,
      banners,
    });

    getStore().branding = body;

    if (fromDb) {
      return NextResponse.json({ source: "mysql", ...fromDb });
    }
    return NextResponse.json({ source: "mock", ...body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
