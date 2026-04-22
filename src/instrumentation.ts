/**
 * Next.js 15 instrumentation hook. Runs once per server process.
 *
 * Responsibilities:
 *   - emit a startup config sanity check (always)
 *   - start MSW mocks if NEXT_PUBLIC_MOCKS_ENABLED !== "false"
 *
 * Phase 2+ additions: OpenTelemetry tracer init lands here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runStartupCheck } = await import("./server/startupCheck");
  runStartupCheck();

  if (process.env.NEXT_PUBLIC_MOCKS_ENABLED === "false") return;
  const { ensureMswStarted } = await import("./mocks/node");
  await ensureMswStarted();
}
