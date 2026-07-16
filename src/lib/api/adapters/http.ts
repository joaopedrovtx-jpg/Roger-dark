/**
 * Adapter HTTP — chama o BFF Next.js (/api/v1/*).
 * Ative com NEXT_PUBLIC_DARKPAY_DATA_MODE=http
 */

import type { DarkPayApi } from "../client";

const base =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_DARKPAY_API_BASE) ||
  "/api/v1";

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  // Cookie + Bearer (sessionStorage) — mesmo padrão do authedFetch
  if (typeof window !== "undefined" && !headers.has("Authorization")) {
    try {
      const token = window.sessionStorage.getItem("darkpay.session.token");
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      /* private mode */
    }
  }

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as {
        error?: string | { message?: string };
      };
      if (typeof body.error === "string") message = body.error;
      else if (body.error && typeof body.error === "object" && body.error.message) {
        message = body.error.message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const httpAdapter: DarkPayApi = {
  login: (input) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  register: (input) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  forgotPassword: (email) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (input) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getDashboard: (period) =>
    request(`/dashboard?period=${encodeURIComponent(period)}`),
  getTransactions: (params) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request(`/transactions${qs ? `?${qs}` : ""}`);
  },
  getFinance: () => request("/finance"),
  createWithdrawal: (input) =>
    request("/withdrawals", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getProfile: () => request("/me"),
  getBranding: () => request("/branding"),
  updateBranding: (branding) =>
    request("/branding", {
      method: "PUT",
      body: JSON.stringify(branding),
    }),
  getAdminMetrics: (period) =>
    request(
      `/admin/metrics${period ? `?period=${encodeURIComponent(period)}` : ""}`
    ),
  listSellers: (params) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request(`/admin/sellers${qs ? `?${qs}` : ""}`);
  },
  listWithdrawalsAdmin: (params) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request(`/admin/withdrawals${qs ? `?${qs}` : ""}`);
  },
  setWithdrawalStatus: (id, status) =>
    request(`/admin/withdrawals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  createPayment: (input) =>
    request("/payments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getPayment: (id) => request(`/payments/${id}`),
  listPayments: () => request("/payments"),
  simulatePaymentPaid: (id) =>
    request(`/payments/${id}/simulate-pay`, { method: "POST" }),
};
