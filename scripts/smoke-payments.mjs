/**
 * Smoke tests de pagamento (rodar na VPS ou local com DB).
 * Uso: node scripts/smoke-payments.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

async function main() {
  const base = process.env.SMOKE_BASE || "http://127.0.0.1:3012";
  let failed = 0;
  const ok = (name, pass, detail) => {
    console.log(pass ? "OK " : "FAIL", name, detail || "");
    if (!pass) failed++;
  };

  // 1 health
  {
    const r = await fetch(`${base}/api/health`);
    const j = await r.json().catch(() => ({}));
    ok("health", r.ok && j.ok === true, JSON.stringify(j));
  }

  // 2 velana webhook unsigned (não 401)
  {
    const r = await fetch(`${base}/api/v1/webhooks/velana`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "transaction",
        objectId: "0",
        data: { id: 0, status: "waiting_payment" },
      }),
    });
    const t = await r.text();
    ok("velana_unsigned_not_401", r.status !== 401, `status=${r.status} ${t.slice(0, 120)}`);
  }

  // 3 paid unknown id without signature should not 401
  {
    const r = await fetch(`${base}/api/v1/webhooks/velana`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "transaction",
        objectId: "999000111",
        data: { id: 999000111, status: "paid", amount: 100 },
      }),
    });
    // 200 (tx not found / applied false) ou 503 (confirm retry)
    ok(
      "velana_paid_unknown_accepted_or_retry",
      r.status === 200 || r.status === 503,
      `status=${r.status}`
    );
  }

  // 4 routes unauth
  for (const p of [
    "/api/v1/transactions",
    "/api/v1/finance",
    "/api/v1/payments/reconcile",
  ]) {
    const r = await fetch(`${base}${p}`, { method: p.includes("reconcile") ? "POST" : "GET" });
    ok(`unauth_${p}`, r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // 5 podpay still requires signature
  {
    const r = await fetch(`${base}/api/v1/webhooks/podpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "transaction.completed", data: { id: "x" } }),
    });
    ok("podpay_requires_sig", r.status === 401, `status=${r.status}`);
  }

  console.log("\n" + (failed ? `FAILED ${failed}` : "ALL PASSED"));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
