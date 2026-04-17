import pino from "pino";
import { maskPii } from "./mask";

/**
 * Structured logger. Feature code calls `log.info({...}, "msg")`; every
 * string value in the payload is auto-masked if the key smells like PII.
 */
const base = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie"],
    censor: "[REDACTED]",
  },
});

export const log = {
  info(obj: Record<string, unknown>, msg?: string) {
    base.info(maskPii(obj), msg);
  },
  warn(obj: Record<string, unknown>, msg?: string) {
    base.warn(maskPii(obj), msg);
  },
  error(obj: Record<string, unknown>, msg?: string) {
    base.error(maskPii(obj), msg);
  },
  debug(obj: Record<string, unknown>, msg?: string) {
    base.debug(maskPii(obj), msg);
  },
};
