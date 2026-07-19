import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const SENSITIVE = /password|secret|token|authorization|cookie|privatekey|apikey|pixkey|backup/i;

function redactPath(path: string): boolean {
  return SENSITIVE.test(path);
}

export const log = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "token", "password", "privateKey", "secret"],
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
