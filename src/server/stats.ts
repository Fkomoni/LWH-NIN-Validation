import "server-only";
import { getKv } from "./kv";

/**
 * Lightweight, persistent counters for the admin dashboard.
 *
 * Counter families:
 *   - NIN writes (every successful prognosis.upsert.ok)
 *     · split into principal vs dependent
 *   - DOB updates (every successful prognosis.dob.update.ok)
 *
 * Each family has an all-time total + a per-UTC-day counter (kept for
 * 30 days). Reads + writes are best-effort: a Redis blip must never
 * block the user-facing flow that fired the increment.
 */

const NIN_TOTAL = "stats:nin:total";
const NIN_PRINCIPAL_TOTAL = "stats:nin:principal:total";
const NIN_DEPENDENT_TOTAL = "stats:nin:dependent:total";
const DOB_TOTAL = "stats:dob:total";
const DAY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type NinRole = "PRINCIPAL" | "DEPENDENT";

function todayKey(family: "nin" | "dob"): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `stats:${family}:day:${yyyy}-${mm}-${dd}`;
}

/**
 * Record a successful NIN write.
 * `role` (when supplied) splits the count into principal vs dependent
 * sub-counters in addition to the all-time total.
 */
export async function recordNinSuccess(role?: NinRole): Promise<void> {
  const kv = getKv();
  try {
    const ops: Promise<unknown>[] = [
      kv.incr(NIN_TOTAL),
      kv.incr(todayKey("nin"), { ttlMs: DAY_TTL_MS }),
    ];
    if (role === "PRINCIPAL") ops.push(kv.incr(NIN_PRINCIPAL_TOTAL));
    if (role === "DEPENDENT") ops.push(kv.incr(NIN_DEPENDENT_TOTAL));
    await Promise.all(ops);
  } catch {
    /* non-fatal */
  }
}

export async function recordDobUpdateSuccess(): Promise<void> {
  const kv = getKv();
  try {
    await Promise.all([
      kv.incr(DOB_TOTAL),
      kv.incr(todayKey("dob"), { ttlMs: DAY_TTL_MS }),
    ]);
  } catch {
    /* non-fatal */
  }
}

export interface PortalStats {
  ninTotal: number;
  ninToday: number;
  ninPrincipalTotal: number;
  ninDependentTotal: number;
  dobTotal: number;
  dobToday: number;
}

export async function getPortalStats(): Promise<PortalStats> {
  const kv = getKv();
  const [nt, nd, np, nDep, dt, dd] = await Promise.all([
    kv.get<number>(NIN_TOTAL),
    kv.get<number>(todayKey("nin")),
    kv.get<number>(NIN_PRINCIPAL_TOTAL),
    kv.get<number>(NIN_DEPENDENT_TOTAL),
    kv.get<number>(DOB_TOTAL),
    kv.get<number>(todayKey("dob")),
  ]);
  return {
    ninTotal: nt ?? 0,
    ninToday: nd ?? 0,
    ninPrincipalTotal: np ?? 0,
    ninDependentTotal: nDep ?? 0,
    dobTotal: dt ?? 0,
    dobToday: dd ?? 0,
  };
}
