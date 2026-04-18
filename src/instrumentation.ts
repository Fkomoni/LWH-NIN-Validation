/**
 * Next.js 15 instrumentation hook. Runs once per server process.
 *
 * Responsibilities:
 *   - emit a startup config sanity check (always)
 *   - start MSW mocks only in dev / test when mocks are opted-in
 *
 * MSW is hard-gated behind NODE_ENV !== 'production' here so the
 * mock interceptor cannot load in a production process even if the
 * env flag is misconfigured. startupCheck also throws on mocks=true
 * in production; this second gate is belt-and-braces.
 *
 * Phase 2+ additions: OpenTelemetry tracer init lands here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runStartupCheck } = await import("./server/startupCheck");
  runStartupCheck();

  if (process.env.NODE_ENV === "production") return;
  if (process.env.NEXT_PUBLIC_MOCKS_ENABLED !== "true") return;
  const { ensureMswStarted } = await import("./mocks/node");
  await ensureMswStarted();
}
