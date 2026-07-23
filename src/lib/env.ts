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

  PODPAY_WEBHOOK_SECRET: str({ default: "" }),
  VELANA_WEBHOOK_SECRET: str({ default: "" }),

  REDIS_URL: url({ default: "redis://localhost:6379" }),

  UPLOADTHING_SECRET: str({ default: "" }),
  UPLOADTHING_APP_ID: str({ default: "" }),

  LOG_LEVEL: str({ choices: ["debug", "info", "warn", "error"], default: "info" }),
});
