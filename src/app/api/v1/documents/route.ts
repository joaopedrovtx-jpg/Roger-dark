/**
 * GET  /api/v1/documents lista documentos do seller logado
 * POST /api/v1/documents envia pacote de documentos (upsert por kind)
 */
import { NextResponse } from "next/server";
import { requireAuth, isGuardFail } from "@/lib/server/guards";
import { prisma } from "@/lib/server/prisma";
import {
  DOC_KIND_LABELS,
  REQUIRED_DOC_KINDS,
  buildKyc,
} from "@/lib/kyc";
import type { SellerDocKind } from "@/lib/domain/types";

function newId(prefix: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

const ALLOWED = new Set<string>(REQUIRED_DOC_KINDS);

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (isGuardFail(auth)) return auth.error;

  const docs = await prisma.document.findMany({
    where: { userId: auth.user.id },
    orderBy: { submittedAt: "desc" },
  });

  const kyc = buildKyc(auth.user.status, docs);

  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      typeLabel: d.typeLabel,
      status: d.status,
      submittedAt: d.submittedAt.toISOString(),
      previewUrl: d.previewUrl,
      notes: d.notes,
    })),
    required: REQUIRED_DOC_KINDS.map((kind) => ({
      kind,
      typeLabel: DOC_KIND_LABELS[kind],
    })),
    kyc,
    accountStatus: auth.user.status,
  });
}

type BodyDoc = {
  kind: string;
  fileName?: string;
  /** data URL opcional (imagem/PDF); limita tamanho no handler */
  dataUrl?: string | null;
};

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (isGuardFail(auth)) return auth.error;

  if (auth.user.status === "bloqueado") {
    return NextResponse.json({ error: "Conta bloqueada" }, { status: 403 });
  }

  let body: { documents?: BodyDoc[] };
  try {
    body = (await req.json()) as { documents?: BodyDoc[] };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const list = Array.isArray(body.documents) ? body.documents : [];
  if (!list.length) {
    return NextResponse.json(
      { error: "Envie ao menos um documento" },
      { status: 400 }
    );
  }

  const byKind = new Map<string, BodyDoc>();
  for (const item of list) {
    const kind = String(item.kind || "").trim();
    if (!ALLOWED.has(kind)) {
      return NextResponse.json(
        {
          error: `Tipo de documento inválido: ${kind}`,
          allowed: [...ALLOWED],
        },
        { status: 400 }
      );
    }
    byKind.set(kind, item);
  }

  // Exige os 4 tipos no envio completo
  for (const kind of REQUIRED_DOC_KINDS) {
    if (!byKind.has(kind)) {
      return NextResponse.json(
        {
          error: `Documento obrigatório ausente: ${DOC_KIND_LABELS[kind as SellerDocKind]}`,
          missing: kind,
        },
        { status: 400 }
      );
    }
  }

  const MAX_DATA = 1_200_000; // ~1.2MB por arquivo em base64

  for (const [kind, item] of byKind) {
    let previewUrl: string | null = null;
    if (item.dataUrl && typeof item.dataUrl === "string") {
      if (item.dataUrl.length > MAX_DATA) {
        return NextResponse.json(
          {
            error: `Arquivo muito grande em ${DOC_KIND_LABELS[kind as SellerDocKind]}. Máx. ~800KB por arquivo.`,
          },
          { status: 400 }
        );
      }
      if (
        item.dataUrl.startsWith("data:image/") ||
        item.dataUrl.startsWith("data:application/pdf")
      ) {
        previewUrl = item.dataUrl;
      }
    }
    if (!previewUrl && item.fileName) {
      previewUrl = `uploaded:${item.fileName}`;
    }

    const typeLabel =
      DOC_KIND_LABELS[kind as SellerDocKind] || kind;
    const existing = await prisma.document.findFirst({
      where: { userId: auth.user.id, kind },
    });

    if (existing) {
      await prisma.document.update({
        where: { id: existing.id },
        data: {
          typeLabel,
          status: "pendente",
          previewUrl: previewUrl ?? existing.previewUrl,
          submittedAt: new Date(),
          notes: item.fileName
            ? `Arquivo: ${item.fileName}`
            : existing.notes,
          reviewedAt: null,
          reviewedBy: null,
        },
      });
    } else {
      await prisma.document.create({
        data: {
          id: newId("doc"),
          userId: auth.user.id,
          userName: auth.user.name,
          userEmail: auth.user.email,
          kind,
          typeLabel,
          status: "pendente",
          previewUrl,
          notes: item.fileName ? `Arquivo: ${item.fileName}` : null,
        },
      });
    }
  }

  // Mantém conta pendente até o admin aprovar (status → ativo)
  if (auth.user.status === "ativo") {
    // reenvio em conta já ativa: não rebaixa status
  } else {
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { status: "pendente" },
    });
  }

  const docs = await prisma.document.findMany({
    where: { userId: auth.user.id },
    select: { kind: true, status: true },
  });
  const kyc = buildKyc(
    auth.user.status === "ativo" ? "ativo" : "pendente",
    docs
  );

  return NextResponse.json({
    ok: true,
    message:
      "Documentos enviados. Aguarde a análise da equipe para liberar o gateway.",
    kyc,
  });
}
