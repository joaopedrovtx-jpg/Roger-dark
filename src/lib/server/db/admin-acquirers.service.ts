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

async function ensureGatewayAcquirers() {
  const velana = await prisma.acquirer.findUnique({ where: { id: "velana" } });
  if (!velana) {
    await prisma.acquirer.create({
      data: {
        id: "velana",
        name: "Velana",
        code: "VELANA",
        status: "ativo",
        priority: 1,
        isPrimary: true,
        enabled: true,
        env: "live",
        feePercent: 0,
        feeFixed: 0.8,
        settlement: "D+0",
      },
    });
  }
  const podpay = await prisma.acquirer.findUnique({ where: { id: "podpay" } });
  if (!podpay) {
    await prisma.acquirer.create({
      data: {
        id: "podpay",
        name: "PodPay",
        code: "PODPAY",
        status: "ativo",
        priority: 2,
        isPrimary: false,
        enabled: true,
        env: "sandbox",
        feePercent: 1.49,
        feeFixed: 0.15,
        settlement: "D+0",
      },
    });
  }
}

export async function listAdminAcquirers() {
  if (!(await dbAvailable())) return null;
  try { await ensureGatewayAcquirers(); } catch { /* ignore */ }
  try { await syncAcquirerPrimaryFlags(); } catch { /* ignore */ }
  const items = await prisma.acquirer.findMany({
    orderBy: { priority: "asc" },
  });
  return items.map((a) => {
    const pub = (a.publicKey ?? "").trim();
    const priv = (a.privateKey ?? "").trim();
    return {
      id: a.id,
      name: a.name,
      code: a.code,
      status: a.status,
      feePercent: n(a.feePercent),
      feeFixed: n(a.feeFixed),
      volumeMes: n(a.volumeMes),
      transactionsMes: a.transactionsMes,
      settlement: a.settlement,
      priority: a.priority,
      conversionRate: n(a.conversionRate),
      publicKey: "",
      privateKey: "",
      hasPublicKey: !!pub,
      hasPrivateKey: !!priv,
      publicKeyHint: pub ? `…${pub.slice(-4)}` : null,
      privateKeyHint: priv ? `…${priv.slice(-4)}` : null,
      env: a.env,
      enabled: a.enabled,
      isPrimary: a.isPrimary,
    };
  });
}

export async function getAcquirerSecrets(id: string) {
  if (!(await dbAvailable())) return null;
  const a = await findAcquirerByRef(id);
  if (!a) return null;
  return {
    id: a.id,
    publicKey: a.publicKey ?? "",
    privateKey: a.privateKey ?? "",
    env: a.env,
  };
}

export async function getAdminAcquirersMetrics() {
  const list = await listAdminAcquirers();
  if (!list) return null;
  const volume = list.reduce((a, x) => a + x.volumeMes, 0);
  const txs = list.reduce((a, x) => a + x.transactionsMes, 0);
  const taxasPagas = list.reduce(
    (a, x) =>
      a + x.volumeMes * (x.feePercent / 100) + x.transactionsMes * x.feeFixed,
    0
  );
  return {
    volume,
    txs,
    total: list.length,
    ativos: list.filter((x) => x.status === "ativo").length,
    manutencao: list.filter((x) => x.status === "manutencao").length,
    inativos: list.filter((x) => x.status === "inativo").length,
    taxasPagas,
    ticketMedio: txs > 0 ? volume / txs : 0,
  };
}

export async function dbUpdateAcquirerStatus(
  id: string,
  status: "ativo" | "manutencao" | "inativo"
) {
  if (!(await dbAvailable())) return null;
  const a = await prisma.acquirer.update({
    where: { id },
    data: {
      status,
      enabled: status === "ativo",
    },
  });
  await audit("acquirer.status", "acquirer", id, { status });
  return { id: a.id, status: a.status };
}

export async function syncAcquirerPrimaryFlags() {
  if (!(await dbAvailable())) return;
  const all = await prisma.acquirer.findMany({
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
  if (!all.length) return;
  const primaryId = all[0].id;
  await prisma.$transaction([
    prisma.acquirer.updateMany({
      where: { id: { not: primaryId } },
      data: { isPrimary: false },
    }),
    prisma.acquirer.update({
      where: { id: primaryId },
      data: { isPrimary: true },
    }),
  ]);
}

export async function dbSwapAcquirerPriority(id: string, dir: -1 | 1) {
  if (!(await dbAvailable())) return null;
  const all = await prisma.acquirer.findMany({ orderBy: { priority: "asc" } });
  const idx = all.findIndex((x) => x.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= all.length) return { ok: false };
  const a = all[idx];
  const b = all[swap];
  await prisma.$transaction([
    prisma.acquirer.update({
      where: { id: a.id },
      data: { priority: b.priority },
    }),
    prisma.acquirer.update({
      where: { id: b.id },
      data: { priority: a.priority },
    }),
  ]);
  await syncAcquirerPrimaryFlags();
  await audit("acquirer.priority", "acquirer", id, { dir });
  return { ok: true };
}

export async function dbSetAcquirerPrimary(id: string) {
  if (!(await dbAvailable())) return null;
  const target = await findAcquirerByRef(id);
  if (!target) throw new Error(`Adquirente "${id}" não encontrada`);

  const all = await prisma.acquirer.findMany({
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
  let p = 2;
  for (const row of all) {
    if (row.id === target.id) {
      await prisma.acquirer.update({
        where: { id: row.id },
        data: { priority: 1, isPrimary: true, enabled: true, status: "ativo" },
      });
    } else {
      await prisma.acquirer.update({
        where: { id: row.id },
        data: { priority: p, isPrimary: false },
      });
      p += 1;
    }
  }
  await audit("acquirer.set_primary", "acquirer", target.id, {});
  return { ok: true, id: target.id, priority: 1, isPrimary: true };
}

async function findAcquirerByRef(id: string) {
  const ref = id.trim();
  if (!ref) return null;
  return prisma.acquirer.findFirst({
    where: {
      OR: [
        { id: ref },
        { code: ref },
        { code: ref.toUpperCase() },
        { code: ref.toLowerCase() },
      ],
    },
  });
}

export async function dbSaveAcquirerCredentials(
  id: string,
  data: {
    publicKey?: string;
    privateKey?: string;
    env?: string;
    setPrimary?: boolean;
  }
) {
  if (!(await dbAvailable())) return null;

  try { await ensureGatewayAcquirers(); } catch { /* race */ }

  let existing = await findAcquirerByRef(id);
  const isPodPay = id.toLowerCase() === "podpay" || id.toUpperCase() === "PODPAY";
  const isVelana = id.toLowerCase() === "velana" || id.toUpperCase() === "VELANA";

  if (!existing && isPodPay) {
    existing = await prisma.acquirer.create({
      data: {
        id: "podpay",
        name: "PodPay",
        code: "PODPAY",
        status: "ativo",
        priority: 1,
        isPrimary: true,
        enabled: true,
        env: data.env === "live" ? "live" : "sandbox",
        publicKey: (data.publicKey ?? "").trim() || null,
        privateKey: (data.privateKey ?? "").trim() || null,
        feePercent: 1.49,
        feeFixed: 0.15,
        settlement: "D+0",
      },
    });
    await audit("acquirer.credentials", "acquirer", existing.id, { created: true });
    return {
      id: existing.id,
      publicKey: existing.publicKey ?? "",
      privateKey: existing.privateKey ? "••••" : "",
      hasPrivateKey: !!existing.privateKey,
      hasPublicKey: !!existing.publicKey,
      env: existing.env,
      isPrimary: existing.isPrimary,
    };
  }

  if (!existing && isVelana) {
    existing = await prisma.acquirer.create({
      data: {
        id: "velana",
        name: "Velana",
        code: "VELANA",
        status: "ativo",
        priority: 2,
        isPrimary: !!data.setPrimary,
        enabled: true,
        env: data.env === "sandbox" ? "sandbox" : "live",
        publicKey: (data.publicKey ?? "").trim() || null,
        privateKey: (data.privateKey ?? "").trim() || null,
        feePercent: 0,
        feeFixed: 0.8,
        settlement: "D+0",
      },
    });
    if (data.setPrimary) {
      await prisma.acquirer.updateMany({
        where: { id: { not: "velana" } },
        data: { isPrimary: false },
      });
    }
    await audit("acquirer.credentials", "acquirer", existing.id, { created: true });
    return {
      id: existing.id,
      publicKey: existing.publicKey ?? "",
      privateKey: existing.privateKey ? "••••" : "",
      hasPrivateKey: !!existing.privateKey,
      hasPublicKey: !!existing.publicKey,
      env: existing.env,
      isPrimary: existing.isPrimary,
    };
  }

  if (!existing) {
    throw new Error(
      `Adquirente "${id}" não encontrada. Cadastre em Adquirentes ou use o id correto.`
    );
  }

  const incomingPrivate = (data.privateKey ?? "").trim();
  const incomingPublic = (data.publicKey ?? "").trim();
  const privateKey =
    incomingPrivate && incomingPrivate !== "••••" && !incomingPrivate.startsWith("••")
      ? incomingPrivate
      : (existing.privateKey ?? "").trim();
  const publicKey =
    incomingPublic && incomingPublic !== "••••" && !incomingPublic.startsWith("••")
      ? incomingPublic
      : (existing.publicKey ?? "").trim();

  if (!privateKey && !publicKey) {
    throw new Error(
      isVelana
        ? "Informe a secret key da Velana (Configurações → Credenciais de API)."
        : "Informe ao menos a chave privada."
    );
  }

  if (
    (existing.code === "PODPAY" || existing.id === "podpay" || isPodPay) &&
    incomingPrivate &&
    !incomingPrivate.startsWith("sk_")
  ) {
    throw new Error(
      "Chave privada PodPay inválida. Use sk_test_… (sandbox) ou sk_live_… (produção)."
    );
  }

  if (
    (existing.code === "VELANA" || existing.id === "velana" || isVelana) &&
    !privateKey
  ) {
    throw new Error(
      "Velana exige a secret key (chave secreta da API). A public key sozinha não autentica PIX."
    );
  }

  const env =
    data.env === "live" || data.env === "sandbox"
      ? data.env
      : privateKey.toLowerCase().includes("test") ||
          privateKey.toLowerCase().includes("sandbox")
        ? "sandbox"
        : existing.env || "live";

  if (data.setPrimary) {
    await prisma.acquirer.updateMany({
      where: { id: { not: existing.id } },
      data: { isPrimary: false },
    });
    if (existing.priority !== 1) {
      await prisma.acquirer.updateMany({
        where: { priority: 1, id: { not: existing.id } },
        data: { priority: existing.priority > 1 ? existing.priority : 2 },
      });
    }
  }

  const a = await prisma.acquirer.update({
    where: { id: existing.id },
    data: {
      publicKey: publicKey || null,
      privateKey: privateKey || null,
      env,
      enabled: true,
      status: "ativo",
      ...(data.setPrimary ? { isPrimary: true, priority: 1 } : {}),
    },
  });
  if (data.setPrimary) {
    await syncAcquirerPrimaryFlags();
  }
  await audit("acquirer.credentials", "acquirer", a.id, {
    hasPrivateKey: !!a.privateKey,
    setPrimary: !!data.setPrimary,
  });
  const refreshed = await prisma.acquirer.findUnique({ where: { id: a.id } });
  return {
    id: a.id,
    publicKey: a.publicKey ?? "",
    privateKey: a.privateKey ? "••••" : "",
    hasPrivateKey: !!a.privateKey,
    hasPublicKey: !!a.publicKey,
    env: a.env,
    isPrimary: refreshed?.isPrimary ?? a.isPrimary,
    priority: refreshed?.priority ?? a.priority,
  };
}

export async function dbClearAcquirerCredentials(id: string) {
  if (!(await dbAvailable())) return null;
  const existing = await findAcquirerByRef(id);
  if (!existing) {
    throw new Error(`Adquirente "${id}" não encontrada`);
  }
  await prisma.acquirer.update({
    where: { id: existing.id },
    data: { publicKey: null, privateKey: null },
  });
  await audit("acquirer.credentials.clear", "acquirer", existing.id);
  return { ok: true };
}
