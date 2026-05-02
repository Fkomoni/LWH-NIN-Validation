import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireSecret } from "@/lib/secrets";

/**
 * Short-lived signed cookie that threads the "quick update" funnel
 * across page boundaries. Holds the normalized phone and the funnel
 * step we expect to be on next. NOT a session — it does not authenticate
 * the member to any household data.
 *
 * TTL is short on purpose: once the member is silent for 30 minutes the
 * funnel is considered abandoned and the cookie is dropped. The lead
 * record in KV (see leads.ts) persists for 30 days for follow-up.
 */

const COOKIE_NAME = "lwh_quick";
const TTL_MS = 30 * 60 * 1000;

export type QuickStep =
  | "OTP"
  | "PROFILE_PICK"
  | "NIN"
  | "DOB_FALLBACK"
  | "DEPENDANTS"
  | "DONE";

export interface QuickState {
  phone: string;
  step: QuickStep;
  /** Issued-at epoch ms — the cookie is rejected past TTL. */
  iat: number;
  /** Resolved profile IDs from Prognosis for this phone. */
  enrolleeIds: string[];
  /** Profiles the member ticked when there were multiple matches. */
  selectedEnrolleeIds?: string[];
  /** NIN held in transit between pages (e.g. NIN entered, then DOB
   *  fallback page). Cleared once the flow completes. */
  nin?: string;
  /** Epoch ms when the most recent OTP was issued. Used to drive the
   *  client-side countdown on the verify page. */
  otpSentAt?: number;
}

function sign(payload: string): string {
  return createHmac("sha256", requireSecret("AUTH_SECRET"))
    .update(payload)
    .digest("base64url");
}

function encode(state: QuickState): string {
  const p = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${p}.${sign(p)}`;
}

function decode(raw: string): QuickState | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (
    expected.length !== sig.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    return null;
  }
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as QuickState;
    if (Date.now() - s.iat > TTL_MS) return null;
    return s;
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  };
}

export async function getQuickState(): Promise<QuickState | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return decode(raw);
}

export async function setQuickState(state: Omit<QuickState, "iat">): Promise<void> {
  const store = await cookies();
  const full: QuickState = { ...state, iat: Date.now() };
  store.set(COOKIE_NAME, encode(full), cookieOptions());
}

export async function clearQuickState(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}
