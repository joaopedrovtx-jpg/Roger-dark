/**
 * Helpers server-side para rotas BFF /api/v1/acquirers/velana/*
 */
import type { VelanaConfig } from "./types";
import {
  resolveVelanaConfigServer,
  resolveVelanaConfigFromRequest,
} from "./config";

export async function resolveVelanaConfigForBff(
  req: Request
): Promise<VelanaConfig | null> {
  // Header de teste (admin painel) → depois DB/env
  return (
    resolveVelanaConfigFromRequest(req) || (await resolveVelanaConfigServer())
  );
}

export function velanaNotConfigured() {
  return {
    error:
      "Velana não configurada. Salve pk_ + sk_ em Admin → Adquirentes → Credenciais → Velana.",
    code: "VELANA_NOT_CONFIGURED",
  };
}
