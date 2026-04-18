import "server-only";
import { log } from "@/lib/logger";
import { db } from "./db";

/**
 * Audit sink.
 *
 * Always emits a structured log line (survives even if the DB is
 * down). Additionally persists to the Postgres AuditEvent table when
 * AUDIT_DB_ENABLED=true — the Prisma model already exists in
 * prisma/schema.prisma and gains a durable, append-only trail once
 * the migration lands. DB failures are caught and logged; they do
 * NOT bubble up to the caller because losing an audit write must not
 * break the auth / admin action that triggered it.
 */
export interface AuditEvent {
  action: string;
  actorType: "portal-user" | "admin" | "system";
  actorId?: string;
  memberId?: string;
  traceId: string;
  payload?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

async function persistToDb(event: AuditEvent): Promise<void> {
  if (process.env.AUDIT_DB_ENABLED !== "true") return;
  try {
    await db.auditEvent.create({
      data: {
        action: event.action,
        actorType: event.actorType,
        actorId: event.actorId,
        memberId: event.memberId,
        traceId: event.traceId,
        ip: event.ip,
        userAgent: event.userAgent,
        payload: event.payload ? (event.payload as object) : undefined,
      },
    });
  } catch (err) {
    // Never throw from audit(); the triggering action must still
    // succeed even if the audit DB is offline.
    log.error({ err: String(err), action: event.action }, "audit.db.fail");
  }
}

export async function audit(event: AuditEvent) {
  log.info({ ...event, at: new Date().toISOString() }, "audit");
  // Fire-and-forget the DB write so a slow / offline audit DB cannot
  // stall the auth or admin action that produced the event. The log
  // line above is the synchronous source of truth; the DB row is
  // best-effort durability. persistToDb() already catches its own
  // errors — `void` here simply tells the engine we don't await.
  void persistToDb(event);
}
