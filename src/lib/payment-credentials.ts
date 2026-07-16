/**
 * Credenciais de adquirentes (admin → Configurações de pagamento).
 * Persistidas no browser (localStorage) até haver API/DB.
 */

import {
  clearPodPayConfigClient,
  loadPodPayConfigClient,
  savePodPayConfigClient,
  type PodPayEnv,
} from "@/lib/acquirers/podpay";
import { adquirentesMock } from "@/lib/mock/admin";

const STORAGE_KEY = "darkpay.admin.payment-credentials.v1";

export type AcquirerEnv = "sandbox" | "live";

export interface AcquirerCredential {
  /** id estável (podpay, acq_01, …) */
  id: string;
  /** Código curto ex.: PODPAY, SAFRA */
  code: string;
  name: string;
  /** Chave pública (pk_… / public key) */
  publicKey: string;
  /** Chave privada / secret (sk_… / private key) */
  privateKey: string;
  env: AcquirerEnv;
  /** Adquirente ativa no gateway */
  enabled: boolean;
  updatedAt?: string;
}

export interface PaymentCredentialsStore {
  version: 1;
  items: Record<string, AcquirerCredential>;
}

/** Catálogo base: PodPay + adquirentes mock do admin */
export function defaultAcquirerCatalog(): Omit<
  AcquirerCredential,
  "publicKey" | "privateKey" | "updatedAt"
>[] {
  const podpay: Omit<
    AcquirerCredential,
    "publicKey" | "privateKey" | "updatedAt"
  > = {
    id: "podpay",
    code: "PODPAY",
    name: "PodPay",
    env: "sandbox",
    enabled: true,
  };

  const others = adquirentesMock.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    env: "live" as AcquirerEnv,
    enabled: a.status === "ativo",
  }));

  return [podpay, ...others];
}

function emptyStore(): PaymentCredentialsStore {
  const items: Record<string, AcquirerCredential> = {};
  for (const base of defaultAcquirerCatalog()) {
    items[base.id] = {
      ...base,
      publicKey: "",
      privateKey: "",
    };
  }
  return { version: 1, items };
}

/** Mescla catálogo padrão com o que está salvo (novas adquirentes entram vazias) */
function mergeWithCatalog(
  stored: PaymentCredentialsStore | null
): PaymentCredentialsStore {
  const base = emptyStore();
  if (!stored?.items) return base;
  for (const [id, cred] of Object.entries(stored.items)) {
    if (base.items[id]) {
      base.items[id] = {
        ...base.items[id],
        publicKey: cred.publicKey ?? "",
        privateKey: cred.privateKey ?? "",
        env: cred.env === "sandbox" ? "sandbox" : "live",
        enabled: cred.enabled ?? base.items[id].enabled,
        updatedAt: cred.updatedAt,
      };
    } else {
      // credencial custom salva
      base.items[id] = {
        id: cred.id || id,
        code: cred.code || id.toUpperCase(),
        name: cred.name || id,
        publicKey: cred.publicKey ?? "",
        privateKey: cred.privateKey ?? "",
        env: cred.env === "sandbox" ? "sandbox" : "live",
        enabled: !!cred.enabled,
        updatedAt: cred.updatedAt,
      };
    }
  }

  // Sincroniza PodPay a partir do storage legado (Integrações → PodPay)
  const podpayLegacy = loadPodPayConfigClient();
  if (podpayLegacy?.apiKey && !base.items.podpay?.privateKey) {
    base.items.podpay = {
      ...base.items.podpay,
      privateKey: podpayLegacy.apiKey,
      env: podpayLegacy.env === "sandbox" ? "sandbox" : "live",
      enabled: true,
    };
  }

  return base;
}

export function loadPaymentCredentials(): PaymentCredentialsStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return mergeWithCatalog(null);
    const parsed = JSON.parse(raw) as PaymentCredentialsStore;
    return mergeWithCatalog(parsed);
  } catch {
    return emptyStore();
  }
}

export function savePaymentCredentials(
  store: PaymentCredentialsStore
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(
    new CustomEvent("darkpay:payment-credentials", { detail: store })
  );
}

export function listAcquirerCredentials(): AcquirerCredential[] {
  const store = loadPaymentCredentials();
  return Object.values(store.items).sort((a, b) => {
    if (a.id === "podpay") return -1;
    if (b.id === "podpay") return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

/**
 * Salva/atualiza uma adquirente.
 * Se for PodPay, espelha a chave privada no config PodPay usado pelo gateway.
 */
export function upsertAcquirerCredential(
  input: Partial<AcquirerCredential> & { id: string }
): AcquirerCredential {
  const store = loadPaymentCredentials();
  const prev = store.items[input.id] ?? {
    id: input.id,
    code: input.code || input.id.toUpperCase(),
    name: input.name || input.id,
    publicKey: "",
    privateKey: "",
    env: "sandbox" as AcquirerEnv,
    enabled: true,
  };

  const next: AcquirerCredential = {
    ...prev,
    ...input,
    publicKey: (input.publicKey ?? prev.publicKey ?? "").trim(),
    privateKey: (input.privateKey ?? prev.privateKey ?? "").trim(),
    env: (input.env ?? prev.env) === "sandbox" ? "sandbox" : "live",
    enabled: input.enabled ?? prev.enabled,
    updatedAt: new Date().toISOString(),
  };

  store.items[next.id] = next;
  savePaymentCredentials(store);
  syncPodPayIfNeeded(next);
  return next;
}

export function clearAcquirerCredential(id: string): void {
  const store = loadPaymentCredentials();
  const prev = store.items[id];
  if (!prev) return;
  store.items[id] = {
    ...prev,
    publicKey: "",
    privateKey: "",
    updatedAt: new Date().toISOString(),
  };
  savePaymentCredentials(store);
  if (id === "podpay") clearPodPayConfigClient();
}

function syncPodPayIfNeeded(cred: AcquirerCredential): void {
  if (cred.id !== "podpay" && cred.code !== "PODPAY") return;
  if (!cred.privateKey.trim()) {
    clearPodPayConfigClient();
    return;
  }
  const env: PodPayEnv =
    cred.privateKey.includes("test") || cred.env === "sandbox"
      ? "sandbox"
      : "live";
  savePodPayConfigClient({
    apiKey: cred.privateKey.trim(),
    env,
    postbackBaseUrl:
      typeof window !== "undefined" ? window.location.origin : undefined,
  });
}

export function hasCredentials(c: AcquirerCredential): boolean {
  return !!(c.publicKey.trim() || c.privateKey.trim());
}

export function maskKey(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length <= 10) return "••••••••";
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

export { STORAGE_KEY as PAYMENT_CREDENTIALS_STORAGE_KEY };
