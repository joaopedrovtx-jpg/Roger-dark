/**
 * Re-exports canônicos — evita drift com security.ts
 */
export {
  isMockAllowed,
  isProduction,
  assertSellerCanTransact,
} from "@/lib/server/security";
