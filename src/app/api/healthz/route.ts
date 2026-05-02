import { NextResponse } from "next/server";

/**
 * Render health check.
 *
 * Kept intentionally trivial: Render probes this URL every few seconds;
 * anything that touches the DB / Prognosis / Qore here would multiply
 * upstream load and give false negatives on transient provider blips.
 * Deeper readiness / dependency probes land at /api/readyz in Phase 3.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "lwh-nin-validation",
      mode: process.env.NEXT_PUBLIC_MOCKS_ENABLED === "false" ? "live" : "mock",
      ts: new Date().toISOString(),
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
