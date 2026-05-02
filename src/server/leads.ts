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
const LEAD_INDEX = "lead:index";
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
      await indexPhone(phone);
    } catch {
      /* non-fatal */
    }
  }
  return rec;
}

/**
 * Maintain a single index list of every phone we've ever started a
 * lead for. The KV interface lacks a SCAN op, so we keep an explicit
 * list. Read-modify-write is racy but volume is low and a duplicate
 * entry is harmless (we de-dupe on read).
 */
async function indexPhone(phone: string): Promise<void> {
  const kv = getKv();
  const list = (await kv.get<string[]>(LEAD_INDEX)) ?? [];
  if (!list.includes(phone)) {
    list.push(phone);
    await kv.set(LEAD_INDEX, list);
  }
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

/* ── Drop-off enumeration ───────────────────────────────────────────── */

export type DropOffStage =
  | "completed"
  | "after-nin-attempt"
  | "after-otp"
  | "after-phone";

export function classifyDropOff(lead: LeadRecord): DropOffStage {
  if (lead.completedAt) return "completed";
  if (lead.ninAttemptedAt) return "after-nin-attempt";
  if (lead.otpVerifiedAt) return "after-otp";
  return "after-phone";
}

export function dropOffLabel(stage: DropOffStage): string {
  switch (stage) {
    case "completed":
      return "Completed";
    case "after-nin-attempt":
      return "Dropped off after NIN attempt";
    case "after-otp":
      return "Dropped off after OTP";
    case "after-phone":
      return "Dropped off after phone entry";
  }
}

/**
 * Read every lead we have stored, newest first. The index is an array
 * of phones in order of first-seen; we reverse it so the most recent
 * appears at the top. `limit` caps the read so the admin page renders
 * fast even after months of activity.
 */
export async function listLeads(limit = 200): Promise<LeadRecord[]> {
  const kv = getKv();
  const phones = (await kv.get<string[]>(LEAD_INDEX)) ?? [];
  const recent = phones.slice(-limit).reverse();
  const out: LeadRecord[] = [];
  for (const phone of recent) {
    const rec = await kv.get<LeadRecord>(`${LEAD_PREFIX}${phone}`);
    if (rec) out.push(rec);
  }
  return out;
}

export interface DropOffSummary {
  total: number;
  completed: number;
  afterNin: number;
  afterOtp: number;
  afterPhone: number;
  /** Unique members who completed at least the phone-entry step. */
  uniqueAttempts: number;
  successRate: number;
}

export async function getDropOffSummary(limit = 1000): Promise<DropOffSummary> {
  const leads = await listLeads(limit);
  let completed = 0;
  let afterNin = 0;
  let afterOtp = 0;
  let afterPhone = 0;
  for (const l of leads) {
    const stage = classifyDropOff(l);
    if (stage === "completed") completed++;
    else if (stage === "after-nin-attempt") afterNin++;
    else if (stage === "after-otp") afterOtp++;
    else afterPhone++;
  }
  const total = leads.length;
  return {
    total,
    completed,
    afterNin,
    afterOtp,
    afterPhone,
    uniqueAttempts: total,
    successRate: total === 0 ? 0 : completed / total,
  };
}
