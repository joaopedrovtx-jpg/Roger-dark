export function isMockAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ALLOW_MOCK_DATA === "1";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function assertSellerCanTransact(status: string): void {
  if (status === "bloqueado") {
    throw new Error("Conta bloqueada. Fale com o suporte.");
  }
  if (status === "pendente") {
    throw new Error(
      "Conta pendente de aprovação. Complete o cadastro e aguarde a análise."
    );
  }
}
