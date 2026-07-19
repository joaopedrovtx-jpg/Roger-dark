import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  password: z.string().min(10, "Senha deve ter no mínimo 10 caracteres"),
});

export const twoFactorSchema = z.object({
  challenge: z.string().min(1, "Challenge obrigatório"),
  token: z.string().min(1, "Token obrigatório"),
});

export const twoFactorSetupSchema = z.object({
  action: z.enum(["enable", "disable"]),
  token: z.string().min(1, "Código 2FA obrigatório"),
});

export const createWithdrawalSchema = z.object({
  amount: z.number().min(5, "Saque mínimo: R$ 5,00"),
  pixKey: z.string().min(1, "Chave PIX obrigatória"),
});

export const createPaymentSchema = z.object({
  amount: z.number().min(1, "Valor mínimo: R$ 1,00"),
  description: z.string().optional(),
  customerName: z.string().optional(),
  customerDocument: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ativo", "pendente", "bloqueado"]),
});

export const updateUserFeesSchema = z.object({
  fees: z.object({
    mdrPercent: z.number().min(0),
    mdrFixed: z.number().min(0),
    saquePercent: z.number().min(0),
    saqueFixed: z.number().min(0),
  }),
});

export const updateUserRoutingSchema = z.object({
  saqueAutomatico: z.boolean().optional(),
  routingMode: z.enum(["personalizado", "plataforma"]).optional(),
  preferredAdquirenteId: z.string().nullable().optional(),
  adquirenteIds: z.array(z.string()).optional(),
});

export const documentsStatusSchema = z.object({
  documentsStatus: z.enum(["aprovado", "pendente", "rejeitado"]),
});

export const setWithdrawalStatusSchema = z.object({
  status: z.enum(["pago", "recusado"]),
});

export const updateAcquirerStatusSchema = z.object({
  status: z.enum(["ativo", "manutencao", "inativo"]),
});

export const acquirerPrioritySchema = z.object({
  priorityDir: z.union([z.literal(1), z.literal(-1)]),
});

export const acquirerCredentialsSchema = z.object({
  publicKey: z.string().optional(),
  privateKey: z.string().optional(),
  env: z.enum(["sandbox", "live"]).optional(),
  setPrimary: z.boolean().optional(),
});

export const saveBrandingSchema = z.object({
  logoUrl: z.string().min(1, "logoUrl obrigatório"),
  faviconUrl: z.string().optional(),
  authImageUrl: z.string().min(1, "authImageUrl obrigatório"),
  banners: z.array(
    z.object({
      id: z.string(),
      imageUrl: z.string(),
      name: z.string(),
      linkUrl: z.string(),
    })
  ).default([]),
});

export const updateManagerStatusSchema = z.object({
  status: z.enum(["ativo", "inativo"]),
});

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
