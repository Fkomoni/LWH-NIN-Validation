import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";
import { log } from "@/lib/logger";

/**
 * Prisma client singleton. Phase 2 wires a real DATABASE_URL; in Phase 1
 * this module is imported but never used at runtime (mocks short-circuit
 * all DB calls). The singleton pattern avoids the dev-mode connection
 * explosion caused by Next's module re-evaluation.
 *
 * Prisma log events are narrowed to ['error'] in production (was
 * ['error', 'warn']) and routed through the masking logger in
 * src/lib/logger.ts. Warnings are suppressed because their messages
 * can include constraint names and bind parameters that may contain
 * PII (e.g. a uniqueness failure on ninHash / phoneHash).
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function makeClient(): PrismaClient {
  const client = new PrismaClient({
    log: [{ emit: "event", level: "error" }],
  });
  client.$on("error" as never, ((e: Prisma.LogEvent) => {
    // Surface only the category + a short message string. Do NOT log
    // e.target (may contain column names). This still gives ops a
    // signal to correlate with the triggering audit event.
    log.error(
      { target: "prisma", message: String(e.message ?? "").slice(0, 240) },
      "prisma.error",
    );
  }) as never);
  return client;
}

export const db = globalThis.__prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
