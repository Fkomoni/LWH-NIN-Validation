import "server-only";
import { log } from "@/lib/logger";

/**
 * Phase-1 audit sink: structured logs only. Phase 3 writes to Postgres
 * AuditEvent with 12-month retention.
 */
export async function audit(event: {
  action: string;
  actorType: "portal-user" | "admin" | "system";
  actorId?: string;
  memberId?: string;
  traceId: string;
  payload?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}) {
  log.info({ ...event, at: new Date().toISOString() }, "audit");
}
