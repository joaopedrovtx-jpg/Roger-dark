import type { DarkPayApi, DataMode } from "./types";
import { mockAdapter } from "./adapters/mock";
import { httpAdapter } from "./adapters/http";

function resolveMode(): DataMode {
  if (typeof process !== "undefined") {
    const m = process.env.NEXT_PUBLIC_DARKPAY_DATA_MODE;
    if (m === "http" || m === "mock") return m;
  }
  // padrão REAL: BFF / API (não mock em memória)
  return "http";
}

export function getApi(): DarkPayApi {
  return resolveMode() === "http" ? httpAdapter : mockAdapter;
}

/** Singleton conveniente */
export const api = {
  get mode() {
    return resolveMode();
  },
  get client() {
    return getApi();
  },
};
