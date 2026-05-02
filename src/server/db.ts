import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Phase 2 wires a real DATABASE_URL; in Phase 1
 * this module is imported but never used at runtime (mocks short-circuit
 * all DB calls). The singleton pattern avoids the dev-mode connection
 * explosion caused by Next's module re-evaluation.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
