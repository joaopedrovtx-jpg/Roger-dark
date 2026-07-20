import { NextResponse } from "next/server";
import { getBrandingFromStore, getStore } from "@/lib/server/memory-store";
import type { PlatformBranding } from "@/lib/domain/types";
import {
  dbSaveBranding,
  getBrandingFromDb,
} from "@/lib/server/db/admin-branding.service";
import { isGuardFail, requireStaffPermission } from "@/lib/server/guards";

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

    const banners = (body.banners ?? []).map((b) => ({
      id: b.id,
      imageUrl: b.imageUrl,
      name: b.name ?? "",
      linkUrl: b.linkUrl ?? "",
    }));

    const fromDb = await dbSaveBranding({
      logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl || body.logoUrl,
      authImageUrl: body.authImageUrl,
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
