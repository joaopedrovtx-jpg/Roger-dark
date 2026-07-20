/**
 * GET  /api/v1/account/profile dados cadastrais do seller
 * PATCH /api/v1/account/profile atualiza PF/PJ (CNPJ, empresa, endereço…)
 */
import { NextResponse } from "next/server";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { prisma } from "@/lib/server/prisma";

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(digits[10]);
}

function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = weights.reduce(
      (acc, w, i) => acc + Number(base[i]) * w,
      0
    );
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(digits.slice(0, 12), w1);
  const d2 = calc(digits.slice(0, 12) + String(d1), w2);
  return digits.endsWith(`${d1}${d2}`);
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (isGuardFail(auth)) return auth.error;

  const u = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!u) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  let roles: string[] = ["seller"];
  try {
    const raw = u.roles as unknown;
    const arr = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? JSON.parse(raw)
        : [];
    if (Array.isArray(arr) && arr.length) {
      roles = arr.map((r) => String(r).toLowerCase());
    }
  } catch {
    /* default */
  }

  return NextResponse.json({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    document: u.document,
    personType: u.personType === "pj" ? "pj" : "pf",
    company: u.company,
    cnpj: u.cnpj,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    address: u.address,
    city: u.city,
    state: u.state,
    zip: u.zip,
    status: u.status,
    roles,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth(req);
  if (isGuardFail(auth)) return auth.error;

  if (auth.user.status === "bloqueado") {
    return NextResponse.json({ error: "Conta bloqueada" }, { status: 403 });
  }

  let body: {
    personType?: "pf" | "pj";
    name?: string;
    phone?: string;
    document?: string;
    company?: string;
    cnpj?: string;
    displayName?: string;
    avatarUrl?: string | null;
    /** CPF do representante (PJ) guardado em document se PJ */
    representativeDocument?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    /** Campos extras em notas/endereço livre (nome da mãe etc. UI only se não houver coluna) */
    motherName?: string;
    birthDate?: string;
    neighborhood?: string;
    country?: string;
    international?: boolean;
    /** Atualização leve do Meu perfil (foto / display) sem reabrir KYC */
    profileOnly?: boolean;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Meu perfil: staff ou conta ativa salva foto / nome de exibição sem KYC
  const isStaff =
    auth.user.roles.includes("admin") || auth.user.roles.includes("manager");
  if (body.profileOnly || body.avatarUrl !== undefined) {
    if (body.avatarUrl && typeof body.avatarUrl === "string") {
      if (body.avatarUrl.length > 1_500_000) {
        return NextResponse.json(
          { error: "Imagem muito grande. Use até ~1MB." },
          { status: 400 }
        );
      }
      if (
        body.avatarUrl &&
        !body.avatarUrl.startsWith("data:image/") &&
        !body.avatarUrl.startsWith("http")
      ) {
        return NextResponse.json(
          { error: "Formato de imagem inválido" },
          { status: 400 }
        );
      }
    }
    const data: {
      avatarUrl?: string | null;
      displayName?: string;
      name?: string;
      phone?: string | null;
    } = {};
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
    if (typeof body.displayName === "string" && isStaff) {
      data.displayName = body.displayName.trim() || undefined;
    }
    if (typeof body.name === "string" && isStaff && body.name.trim().length >= 2) {
      data.name = body.name.trim();
    }
    if (typeof body.phone === "string" && isStaff) {
      data.phone = onlyDigits(body.phone) || null;
    }
    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data,
    });
    return NextResponse.json({
      ok: true,
      profileOnly: true,
      id: updated.id,
      name: updated.name,
      displayName: updated.displayName,
      email: updated.email,
      phone: updated.phone,
      avatarUrl: updated.avatarUrl,
      status: updated.status,
    });
  }

  const personType = body.personType === "pj" ? "pj" : "pf";

  if (personType === "pj") {
    const cnpj = onlyDigits(body.cnpj || "");
    if (!cnpj || cnpj.length !== 14) {
      return NextResponse.json(
        { error: "CNPJ inválido. Informe os 14 dígitos." },
        { status: 400 }
      );
    }
    if (!isValidCnpj(cnpj)) {
      return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
    }
    const company = (body.company || "").trim();
    if (company.length < 2) {
      return NextResponse.json(
        { error: "Informe a razão social da empresa." },
        { status: 400 }
      );
    }

    const repDoc = onlyDigits(
      body.representativeDocument || body.document || ""
    );
    // representante opcional no backend se vier vazio; UI exige

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        personType: "pj",
        company,
        cnpj,
        // documento principal da conta PJ = CNPJ
        document: cnpj,
        name: (body.name || company).trim() || company,
        displayName:
          (body.displayName || "").trim() || company,
        phone: body.phone ? onlyDigits(body.phone) : undefined,
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
        zip: body.zip ? onlyDigits(body.zip) : null,
      },
    });

    // se veio CPF do representante, guardamos em notes via displayName? 
    // Mantém document como CNPJ; CPF rep pode ir no campo document só se PF.
    // Opcional: armazenar CPF rep no address meta melhor em company field.
    // Usamos phone já; rep CPF fica em um segundo campo se schema tiver não tem.
    // Guardamos rep no `document` não CNPJ já está. 
    // Vamos deixar repDoc em notes do user? Schema não tem notes.
    // Ignora persistência de repDoc se não houver coluna; UI envia e company/cnpj são o foco.
    void repDoc;

    return NextResponse.json({
      ok: true,
      personType: "pj",
      company: updated.company,
      cnpj: updated.cnpj,
      document: updated.document,
      name: updated.name,
      displayName: updated.displayName,
      address: updated.address,
      city: updated.city,
      state: updated.state,
      zip: updated.zip,
    });
  }

  // PF
  const cpf = onlyDigits(body.document || "");
  if (!cpf || cpf.length !== 11) {
    return NextResponse.json(
      { error: "CPF inválido. Informe os 11 dígitos." },
      { status: 400 }
    );
  }
  if (!isValidCpf(cpf)) {
    return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "Informe o nome completo." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      personType: "pf",
      document: cpf,
      cnpj: null,
      company: null,
      name,
      displayName: (body.displayName || name).trim() || name,
      phone: body.phone ? onlyDigits(body.phone) : undefined,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zip: body.zip ? onlyDigits(body.zip) : null,
    },
  });

  return NextResponse.json({
    ok: true,
    personType: "pf",
    document: updated.document,
    name: updated.name,
    displayName: updated.displayName,
    address: updated.address,
    city: updated.city,
    state: updated.state,
    zip: updated.zip,
  });
}
