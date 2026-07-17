/**
 * Logger estruturado leve (JSON em prod, legível em dev).
 * Não loga secrets, tokens nem PIX keys.
 */

type Level = "debug" | "info" | "warn" | "error";

export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

const SENSITIVE =
  /password|secret|token|authorization|cookie|privatekey|apikey|pixkey|backup/i;

function sanitize(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE.test(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level: Level, msg: string, fields?: LogFields) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: "darkpay",
    ...sanitize(fields),
  };
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(payload)
      : `[${payload.ts}] ${level.toUpperCase()} ${msg}${
          fields ? ` ${JSON.stringify(sanitize(fields))}` : ""
        }`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};
