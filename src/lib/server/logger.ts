import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const SENSITIVE = /password|secret|token|authorization|cookie|privatekey|apikey|pixkey|backup/i;

function redactPath(path: string): boolean {
  return SENSITIVE.test(path);
}

export const log = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-secret-key",
      "req.headers.x-api-key",
      "req.headers.x-darkpay-secret",
      "req.headers.x-public-key",
      "token",
      "password",
      "privateKey",
      "secret",
      "pixkey",
      "backup",
    ],
    censor: "[redacted]",
  },
  serializers: {
    req: (r) => ({
      method: r.method,
      url: r.url,
      headers: { ...r.headers, authorization: "[redacted]", cookie: "[redacted]" },
    }),
    err: pino.stdSerializers.err,
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino/file",
        options: { destination: 1, colorize: true },
      },
});
