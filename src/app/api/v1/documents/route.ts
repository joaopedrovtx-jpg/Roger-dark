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
import { reportRouteError } from "@/lib/server/bug-log";

function newId(prefix: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

const ALLOWED = new Set<string>(REQUIRED_DOC_KINDS);

/** MySQL TEXT = 64KB; base64 de foto estoura → 500. Usamos LONGTEXT + teto de payload. */
const MAX_DATA = 1_200_000;

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (isGuardFail(auth)) return auth.error;

  try {
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
        // não devolve data URL gigante na listagem se não precisar
        previewUrl:
          d.previewUrl && d.previewUrl.startsWith("data:")
            ? d.previewUrl.length > 200_000
              ? `data-stored:${d.kind}`
              : d.previewUrl
            : d.previewUrl,
        notes: d.notes,
      })),
      required: REQUIRED_DOC_KINDS.map((kind) => ({
        kind,
        typeLabel: DOC_KIND_LABELS[kind],
      })),
      kyc,
      accountStatus: auth.user.status,
    });
  } catch (err) {
    const bugId = await reportRouteError({
      req,
      err,
      route: "/api/v1/documents",
      statusCode: 500,
      userId: auth.user.id,
      userEmail: auth.user.email,
      meta: { op: "GET" },
    });
    return NextResponse.json(
      {
        error: "Falha ao carregar documentos",
        bugId,
        hint: "Tente novamente. Se persistir, fale com o suporte informando o bugId.",
      },
      { status: 500 }
    );
  }
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

  try {
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

    const BLOCKED_IMAGE_SUBTYPES = ["svg", "svg+xml"];

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
        const dataUrlLower = item.dataUrl.toLowerCase();
        const isAllowedImage =
          dataUrlLower.startsWith("data:image/") &&
          !BLOCKED_IMAGE_SUBTYPES.some((t) =>
            dataUrlLower.startsWith(`data:image/${t}`)
          );
        const isPdf = dataUrlLower.startsWith("data:application/pdf");
        if (isAllowedImage || isPdf) {
          const commaIdx = item.dataUrl.indexOf(",");
          if (commaIdx > 0) {
            const b64 = item.dataUrl.slice(commaIdx + 1).trim();
            if (b64.length > 0) {
              try {
                const decoded = Buffer.from(b64, "base64");
                if (decoded.length < 20) {
                  return NextResponse.json(
                    {
                      error: `Arquivo inválido ou corrompido em ${DOC_KIND_LABELS[kind as SellerDocKind]}.`,
                    },
                    { status: 400 }
                  );
                }
                if (isAllowedImage) {
                  const magic = decoded
                    .slice(0, 8)
                    .toString("hex")
                    .toLowerCase();
                  // JPEG (ffd8ff…), PNG, GIF, BMP, WEBP (RIFF)
                  const validImageHeader =
                    /^ffd8ff/.test(magic) ||
                    /^(89504e47|47494638|424d|52494646)/.test(magic);
                  if (!validImageHeader) {
                    return NextResponse.json(
                      {
                        error: `Formato de imagem não suportado em ${DOC_KIND_LABELS[kind as SellerDocKind]}. Use JPEG, PNG, GIF, WEBP ou BMP.`,
                      },
                      { status: 400 }
                    );
                  }
                }
                if (isPdf) {
                  const magic = decoded.slice(0, 5).toString("ascii");
                  if (magic !== "%PDF-") {
                    return NextResponse.json(
                      {
                        error: `Arquivo PDF inválido em ${DOC_KIND_LABELS[kind as SellerDocKind]}.`,
                      },
                      { status: 400 }
                    );
                  }
                }
              } catch {
                return NextResponse.json(
                  {
                    error: `Erro ao processar arquivo em ${DOC_KIND_LABELS[kind as SellerDocKind]}.`,
                  },
                  { status: 400 }
                );
              }
            }
          }
          previewUrl = item.dataUrl;
        }
      }
      if (!previewUrl && item.fileName) {
        previewUrl = `uploaded:${item.fileName}`;
      }

      const typeLabel = DOC_KIND_LABELS[kind as SellerDocKind] || kind;
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

    if (auth.user.status !== "ativo") {
      await prisma.user.update({
        where: { id: auth.user.id },
        data: { status: "pendente" },
      });
    }

    const refreshed = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { status: true },
    });
    const docs = await prisma.document.findMany({
      where: { userId: auth.user.id },
      select: { kind: true, status: true },
    });
    const kyc = buildKyc(refreshed?.status ?? auth.user.status, docs);

    return NextResponse.json({
      ok: true,
      message:
        "Documentos enviados. Aguarde a análise da equipe para liberar o gateway.",
      kyc,
    });
  } catch (err) {
    const prismaCode =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code || "")
        : "";
    const bugId = await reportRouteError({
      req,
      err,
      route: "/api/v1/documents",
      statusCode: 500,
      userId: auth.user.id,
      userEmail: auth.user.email,
      meta: {
        op: "POST",
        prismaCode: prismaCode || undefined,
        kinds: Array.isArray(body.documents)
          ? body.documents.map((d) => d.kind)
          : [],
        sizes: Array.isArray(body.documents)
          ? body.documents.map((d) =>
              d.dataUrl ? String(d.dataUrl).length : 0
            )
          : [],
      },
    });

    if (prismaCode === "P2000") {
      return NextResponse.json(
        {
          error:
            "Arquivo grande demais para salvar. Envie imagens menores (até ~800KB cada) ou em JPEG/PNG compactado.",
          code: "preview_too_large",
          bugId,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Falha ao enviar documentos",
        bugId,
        hint: "Tente novamente com arquivos menores. Se persistir, informe o bugId ao suporte.",
      },
      { status: 500 }
    );
  }
}
