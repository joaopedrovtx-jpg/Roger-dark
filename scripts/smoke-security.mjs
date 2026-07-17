#!/usr/bin/env node
/**
 * Smoke de segurança — rode com o servidor no ar:
 *   npm run dev
 *   node scripts/smoke-security.mjs
 *
 * Exit 0 se todos os checks passarem.
 */
const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

let failed = 0;
function ok(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
    redirect: "manual",
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body, status: res.status };
}

async function main() {
  console.log(`\nDarkPay smoke security @ ${BASE}\n`);

  // 1) PodPay BFF sem auth
  {
    const { status } = await req("/api/v1/acquirers/podpay/balance");
    ok("PodPay balance sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }

  // 2) Velana BFF sem auth
  {
    const { status } = await req("/api/v1/acquirers/velana/status");
    ok("Velana status sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }

  // 3) Admin acquirers sem auth
  {
    const { status } = await req("/api/v1/admin/acquirers");
    ok("Admin acquirers sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }

  // 4) Login inválido
  {
    const { status, body } = await req("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nope@example.com", password: "wrongpass1" }),
    });
    ok("Login inválido → 401", status === 401, body?.error || `status=${status}`);
  }

  // 5) Webhook podpay sem assinatura (em prod falha; em dev pode aceitar se secret ausente)
  {
    const { status, body } = await req("/api/v1/webhooks/podpay", {
      method: "POST",
      body: JSON.stringify({ event: "transaction.completed", data: { id: "x" } }),
    });
    // Aceita 401 (HMAC fail) ou 200 (dev sem secret) ou 400
    ok(
      "Webhook podpay responde",
      status === 401 || status === 200 || status === 400,
      `status=${status} reason=${body?.reason || body?.error || "ok"}`
    );
  }

  // 5b) Webhook velana
  {
    const { status, body } = await req("/api/v1/webhooks/velana", {
      method: "POST",
      body: JSON.stringify({ type: "transaction", data: { id: "x", status: "waiting_payment" } }),
    });
    ok(
      "Webhook velana responde",
      status === 401 || status === 200 || status === 400,
      `status=${status} reason=${body?.reason || body?.error || "ok"}`
    );
  }

  // 5c) simulate-pay sem auth
  {
    const { status } = await req("/api/v1/payments/fake/simulate-pay", {
      method: "POST",
    });
    ok(
      "simulate-pay sem auth → 401/403",
      status === 401 || status === 403,
      `status=${status}`
    );
  }

  // 6) Health
  {
    const { status } = await req("/api/health").catch(() =>
      req("/api/v1/auth/me")
    );
    ok("Rota pública/health responde", status > 0 && status < 500, `status=${status}`);
  }

  // 7) 2FA challenge endpoint shape (sem challenge válido)
  {
    const { status } = await req("/api/v1/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({ challenge: "bad", token: "000000" }),
    });
    ok("Login 2FA sem challenge → 401/400/503", [400, 401, 503].includes(status), `status=${status}`);
  }

  // 8) Página de login acessível
  {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" });
    ok("GET /login → 200", res.status === 200, `status=${res.status}`);
  }

  // 9) Health com posture de segurança
  {
    const { status, body } = await req("/api/health");
    ok("GET /api/health → 200/503", status === 200 || status === 503, `status=${status}`);
    ok(
      "health.security presente",
      body?.security && typeof body.security.admin2faRequired === "boolean",
      `keys=${body?.security ? Object.keys(body.security).join(",") : "none"}`
    );
  }

  // 10) Finance/admin sem auth
  {
    const { status } = await req("/api/v1/finance");
    ok("Finance sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }
  {
    const { status } = await req("/api/v1/admin/dashboard");
    ok("Admin dashboard sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }

  // 11) CSRF: mutação sem origin em prod seria 403; em dev (sem CSRF_STRICT) passa no gate de auth
  {
    const { status } = await req("/api/v1/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: 10, pixKey: "x@x.com" }),
      headers: { origin: "https://evil.example" },
    });
    // sem sessão: 401; com CSRF_STRICT + sessão: 403 — sem sessão 401 é ok
    ok(
      "Withdrawals POST sem sessão → 401/403",
      status === 401 || status === 403,
      `status=${status}`
    );
  }

  console.log(
    failed === 0
      ? `\n✅ Todos os checks passaram (${failed} falhas)\n`
      : `\n❌ ${failed} check(s) falharam\n`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke falhou ao conectar:", e.message);
  console.error("Suba o server: npm run dev");
  process.exit(2);
});
