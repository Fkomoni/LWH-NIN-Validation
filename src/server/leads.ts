import "server-only";
import { getKv } from "./kv";
import { log } from "@/lib/logger";

/**
 * Lead-funnel persistence for the phone-first quick-update flow.
 *
 * Why a separate module from the auth session?
 *
 * The MD's brief: "ensure the phone number is stored with a commit
 * immediately it is entered, even before the process finishes in case
 * it is abandoned."
 *
 * That is a different lifecycle from the authenticated session — a lead
 * starts the moment the phone is typed in (no auth, no OTP, no NIN yet)
 * and we want to know about every drop-off so the support team can
 * follow up. The record persists for 30 days regardless of what the
 * member does next.
 *
 * Storage: one Upstash hash per normalized phone. TTL 30 days. Each
 * stage of the funnel writes a timestamp; missing timestamps mean the
 * member dropped off at that step.
 */

const LEAD_PREFIX = "lead:phone:";
const LEAD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const STARTED_TOTAL = "stats:lead:started:total";
const OTP_VERIFIED_TOTAL = "stats:lead:otpVerified:total";
const NIN_ATTEMPTED_TOTAL = "stats:lead:ninAttempted:total";
const COMPLETED_TOTAL = "stats:lead:completed:total";

export interface LeadRecord {
  phone: string;
  startedAt: string;
  resolvedEnrolleeIds?: string[];
  otpVerifiedAt?: string;
  ninAttemptedAt?: string;
  ninStatus?: "PENDING" | "NEEDS_DOB_FALLBACK" | "VALIDATED" | "FAILED" | "REVIEW";
  completedAt?: string;
  /** Profile IDs the member selected to update when their phone matched
   *  more than one Leadway record. */
  selectedEnrolleeIds?: string[];
}

function leadKey(phone: string): string {
  return `${LEAD_PREFIX}${phone}`;
}

export async function getLead(phone: string): Promise<LeadRecord | null> {
  return getKv().get<LeadRecord>(leadKey(phone));
}

async function writeLead(rec: LeadRecord): Promise<void> {
  try {
    await getKv().set(leadKey(rec.phone), rec, { ttlMs: LEAD_TTL_MS });
  } catch (err) {
    log.error({ err: String(err) }, "lead.write.fail");
  }
}

/**
 * Stage 1 — phone has been entered.
 *
 * Idempotent: if the same phone re-enters the funnel within 30 days,
 * we keep the original `startedAt`. Subsequent stage timestamps are
 * cleared so the funnel reflects the new attempt.
 */
export async function markLeadStarted(
  phone: string,
  resolvedEnrolleeIds: string[] = [],
): Promise<LeadRecord> {
  const existing = await getLead(phone);
  const now = new Date().toISOString();
  const rec: LeadRecord = existing
    ? {
        ...existing,
        resolvedEnrolleeIds,
        otpVerifiedAt: undefined,
        ninAttemptedAt: undefined,
        ninStatus: undefined,
        completedAt: undefined,
        selectedEnrolleeIds: undefined,
      }
    : {
        phone,
        startedAt: now,
        resolvedEnrolleeIds,
      };
  await writeLead(rec);
  if (!existing) {
    try {
      await getKv().incr(STARTED_TOTAL);
    } catch {
      /* non-fatal */
    }
  }
  return rec;
}

export async function markOtpVerified(phone: string): Promise<void> {
  const existing = await getLead(phone);
  if (!existing) return;
  if (existing.otpVerifiedAt) return;
  await writeLead({ ...existing, otpVerifiedAt: new Date().toISOString() });
  try {
    await getKv().incr(OTP_VERIFIED_TOTAL);
  } catch {
    /* non-fatal */
  }
}

export async function markNinAttempted(
  phone: string,
  status: NonNullable<LeadRecord["ninStatus"]>,
): Promise<void> {
  const existing = await getLead(phone);
  if (!existing) return;
  const isFirst = !existing.ninAttemptedAt;
  await writeLead({
    ...existing,
    ninAttemptedAt: existing.ninAttemptedAt ?? new Date().toISOString(),
    ninStatus: status,
  });
  if (isFirst) {
    try {
      await getKv().incr(NIN_ATTEMPTED_TOTAL);
    } catch {
      /* non-fatal */
    }
  }
}

export async function markLeadCompleted(
  phone: string,
  selectedEnrolleeIds: string[],
): Promise<void> {
  const existing = await getLead(phone);
  if (!existing) return;
  if (existing.completedAt) return;
  await writeLead({
    ...existing,
    selectedEnrolleeIds,
    ninStatus: "VALIDATED",
    completedAt: new Date().toISOString(),
  });
  try {
    await getKv().incr(COMPLETED_TOTAL);
  } catch {
    /* non-fatal */
  }
}

export interface FunnelStats {
  started: number;
  otpVerified: number;
  ninAttempted: number;
  completed: number;
}

export async function getFunnelStats(): Promise<FunnelStats> {
  const kv = getKv();
  const [s, o, n, c] = await Promise.all([
    kv.get<number>(STARTED_TOTAL),
    kv.get<number>(OTP_VERIFIED_TOTAL),
    kv.get<number>(NIN_ATTEMPTED_TOTAL),
    kv.get<number>(COMPLETED_TOTAL),
  ]);
  return {
    started: s ?? 0,
    otpVerified: o ?? 0,
    ninAttempted: n ?? 0,
    completed: c ?? 0,
  };
}
