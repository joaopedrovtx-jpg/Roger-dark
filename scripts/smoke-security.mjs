#!/usr/bin/env node
/**
 * Smoke de segurança — rode com o servidor no ar:
 *   npm run dev
 *   node scripts/smoke-security.mjs
 */
import crypto from "crypto";

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
  return { res, body, status: res.status, headers: res.headers };
}

async function main() {
  console.log(`\nDarkPay smoke security @ ${BASE}\n`);

  {
    const { status } = await req("/api/v1/acquirers/podpay/balance");
    ok("PodPay balance sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }
  {
    const { status } = await req("/api/v1/acquirers/velana/status");
    ok("Velana status sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }
  {
    const { status } = await req("/api/v1/admin/acquirers");
    ok("Admin acquirers sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }
  {
    const { status, body } = await req("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nope@example.com", password: "wrongpass1" }),
    });
    ok("Login inválido → 401", status === 401, body?.error || `status=${status}`);
  }

  // Webhooks SEM assinatura devem falhar (fail-closed)
  {
    const { status, body } = await req("/api/v1/webhooks/podpay", {
      method: "POST",
      body: JSON.stringify({ event: "transaction.completed", data: { id: "x" } }),
    });
    ok(
      "Webhook podpay sem HMAC → 401",
      status === 401,
      `status=${status} reason=${body?.reason || body?.error || "?"}`
    );
  }
  {
    const { status, body } = await req("/api/v1/webhooks/velana", {
      method: "POST",
      body: JSON.stringify({ type: "transaction", data: { id: "x", status: "paid" } }),
    });
    ok(
      "Webhook velana sem HMAC → 401",
      status === 401,
      `status=${status} reason=${body?.reason || body?.error || "?"}`
    );
  }

  // Webhook com HMAC válido (se secret no env do smoke)
  const ppSecret = process.env.PODPAY_WEBHOOK_SECRET;
  if (ppSecret) {
    const raw = JSON.stringify({
      event: "transaction.pending",
      data: { id: "smoke_" + Date.now() },
    });
    const sig = crypto.createHmac("sha256", ppSecret).update(raw, "utf8").digest("hex");
    const { status } = await req("/api/v1/webhooks/podpay", {
      method: "POST",
      headers: { "x-podpay-signature": sig },
      body: raw,
    });
    ok("Webhook podpay com HMAC válido → 200", status === 200, `status=${status}`);
  }

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

  {
    const { status, body } = await req("/api/health");
    ok("GET /api/health → 200/503", status === 200 || status === 503, `status=${status}`);
    ok(
      "health NÃO expõe security posture pública",
      !body?.security,
      body?.security ? "security presente" : "ok minimal"
    );
  }

  {
    const { status } = await req("/api/v1/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({ challenge: "bad", token: "000000" }),
    });
    ok("Login 2FA sem challenge → 401/400/503", [400, 401, 503].includes(status), `status=${status}`);
  }

  {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" });
    ok("GET /login → 200", res.status === 200, `status=${res.status}`);
    const csp = res.headers.get("content-security-policy");
    ok("CSP header presente", !!csp && csp.includes("default-src"), csp?.slice(0, 40) || "missing");
  }

  {
    const { status } = await req("/api/v1/finance");
    ok("Finance sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }
  {
    const { status } = await req("/api/v1/admin/dashboard");
    ok("Admin dashboard sem auth → 401/403", status === 401 || status === 403, `status=${status}`);
  }

  // CSRF: origin evil em mutação (sem sessão → 401; com sessão seria 403)
  {
    const { status } = await req("/api/v1/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: 10, pixKey: "x@x.com" }),
      headers: { origin: "https://evil.example" },
    });
    ok(
      "Withdrawals POST sem sessão → 401/403",
      status === 401 || status === 403,
      `status=${status}`
    );
  }

  // Cookie legado opaco
  {
    const res = await fetch(`${BASE}/dash`, {
      headers: { cookie: "darkpay_session=" + "A".repeat(32) },
      redirect: "manual",
    });
    ok(
      "Cookie legado opaco → redirect login",
      res.status === 307 || res.status === 302,
      `status=${res.status}`
    );
  }

  // XSS name rejected/sanitized
  {
    const { status, body } = await req("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: '<img src=x onerror=alert(1)>',
        email: `smoke${Date.now()}@test.com`,
        password: "SmokeTest@12345",
      }),
    });
    const name = body?.user?.name || "";
    ok(
      "Register sanitiza XSS no nome",
      status === 400 || (status === 201 && !name.includes("<") && !name.includes(">")),
      `status=${status} name=${name}`
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
