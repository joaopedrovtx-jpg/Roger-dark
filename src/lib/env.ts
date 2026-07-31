import { cleanEnv, str, num, bool, url } from "envalid";

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }),
  DATABASE_URL: str({ default: "" }),
  SESSION_SECRET: str({ default: "" }),
  RESEND_API_KEY: str({ default: "" }),
  EMAIL_FROM: str({ default: "DarkPay <onboarding@resend.dev>" }),
  ALLOW_MOCK_DATA: str({ default: "0" }),
  COOKIE_SECURE: str({ default: "0" }),
  FORCE_INSECURE_COOKIE: str({ default: "0" }),

  // Rate limit / segurança
  TRUST_PROXY: str({ default: "0" }),
  CSRF_STRICT: str({ default: "1" }),
  CSRF_ALLOW_MISSING_ORIGIN: str({ default: "0" }),

  // Webhook secrets
  PODPAY_WEBHOOK_SECRET: str({ default: "" }),
  VELANA_WEBHOOK_SECRET: str({ default: "" }),
  WOOVI_WEBHOOK_SECRET: str({ default: "" }),
  ALLOW_UNSIGNED_WEBHOOKS: str({ default: "0" }),

  // API credentials
  API_SECRET_ENCRYPTION_KEY: str({ default: "" }),

  // Acquirer keys
  PODPAY_API_KEY: str({ default: "" }),
  VELANA_PUBLIC_KEY: str({ default: "" }),
  VELANA_SECRET_KEY: str({ default: "" }),
  WOOVI_APP_ID: str({ default: "" }),

  // Cloudflare Turnstile (anti-bot)
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: str({ default: "" }),
  TURNSTILE_SECRET_KEY: str({ default: "" }),

  REDIS_URL: url({ default: "redis://localhost:6379" }),

  UPLOADTHING_SECRET: str({ default: "" }),
  UPLOADTHING_APP_ID: str({ default: "" }),

  LOG_LEVEL: str({ choices: ["debug", "info", "warn", "error"], default: "info" }),
});
