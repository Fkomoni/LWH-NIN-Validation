/**
 * Next.js 15 instrumentation hook. Runs once per server process.
 * Phase 1: starts MSW so fetch() calls against mock.nimc.local are
 * intercepted. Phase 2: OpenTelemetry tracer init lands here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PUBLIC_MOCKS_ENABLED === "false") return;

  const { ensureMswStarted } = await import("./mocks/node");
  ensureMswStarted();
}
