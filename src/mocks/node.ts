import "server-only";
import type { SetupServerApi } from "msw/node";
import { handlers } from "./handlers";

/**
 * Node-side MSW server.
 *
 * We resolve `msw/node` at runtime via a computed specifier so webpack
 * doesn't try to statically bundle the module — MSW ships Node-only
 * subpath exports that webpack can't walk. This module is a no-op in
 * production (NEXT_PUBLIC_MOCKS_ENABLED=false).
 */

let started = false;
let server: SetupServerApi | undefined;

export async function ensureMswStarted(): Promise<void> {
  if (started) return;
  if (process.env.NEXT_PUBLIC_MOCKS_ENABLED === "false") return;

  // Hide from webpack's static analysis.
  const specifier = ["msw", "node"].join("/");
  const mod = (await import(/* webpackIgnore: true */ specifier)) as {
    setupServer: (...h: unknown[]) => SetupServerApi;
  };
  server = mod.setupServer(...handlers);
  server.listen({ onUnhandledRequest: "bypass" });
  started = true;
}
