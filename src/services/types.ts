import type { Household, NinValidationResult } from "@/types/domain";

/* ─── MemberService ───────────────────────────────────────────────────── */

export type MemberLookupResult =
  | { ok: true; household: Household }
  | { ok: false; reason: "NOT_FOUND" | "LOCKED" | "DOB_MISMATCH" | "PROVIDER_ERROR" };

export interface MemberService {
  /** Lookup by enrolleeId + DOB. Returns household on match. */
  authenticateByDob(input: {
    enrolleeId: string;
    dob: string;
    ip: string;
    userAgent: string;
  }): Promise<MemberLookupResult>;

  /** Re-authenticate by NIMC DOB of the principal's NIN. */
  authenticateByPrincipalNin(input: {
    enrolleeId: string;
    nin: string;
    dob: string;
    ip: string;
    userAgent: string;
  }): Promise<MemberLookupResult>;

  /** Fetch household once authenticated. */
  loadHousehold(enrolleeId: string): Promise<Household>;
}

/* ─── OtpService ──────────────────────────────────────────────────────── */

export type OtpRequestResult =
  | { ok: true; channelHint: string; cooldownMs: number }
  | { ok: false; reason: "RATE_LIMITED" | "NO_PHONE_ON_FILE" | "LOCKED" };

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "EXHAUSTED" | "LOCKED" };

export interface OtpService {
  request(input: { enrolleeId: string; ip: string }): Promise<OtpRequestResult>;
  verify(input: { enrolleeId: string; code: string; ip: string }): Promise<OtpVerifyResult>;
}

/* ─── NinService ──────────────────────────────────────────────────────── */

export interface NinService {
  /**
   * Format gate + NIMC call + name/DOB comparison. Idempotent on
   * (enrolleeId, beneficiaryId, nin, idempotencyKey).
   */
  validateForBeneficiary(input: {
    enrolleeId: string;
    beneficiaryId: string;
    nin: string;
    idempotencyKey: string;
  }): Promise<NinValidationResult>;

  /**
   * Verify a principal's NIN for the auth-via-NIN fallback.
   *
   * Compares NIMC's DOB against the DOB the user typed into the form
   * (NOT against Prognosis's record — the whole point of this flow is
   * cases where Prognosis's DOB is wrong). Name is cross-checked
   * against the Prognosis principal's full name for identity.
   */
  verifyForAuth(input: {
    nin: string;
    providedDob: string;
    expectedFullName: string;
    traceId: string;
  }): Promise<{
    match: boolean;
    verifiedFullName?: string;
    dobFromNin?: string;
    nameScore?: number;
    dobMatched?: boolean;
    message: string;
  }>;
}

/* ─── PrognosisService ────────────────────────────────────────────────── */

export interface PrognosisUpdatePayload {
  memberId: string;
  nin: string;
  verifiedFullName: string;
  dobFromNin: string;
  validationStatus: "VALIDATED" | "MANUAL_REVIEW";
  validatedAt: string;
  source: "self-service-portal";
  txnRef: string;
  rawResponseRef?: string;
}

export type PrognosisUpsertResult =
  | { ok: true; txnRef: string }
  | { ok: false; reason: "DUPLICATE" | "PROVIDER_ERROR"; retryable: boolean };

export interface PrognosisService {
  upsertMemberNin(payload: PrognosisUpdatePayload): Promise<PrognosisUpsertResult>;
}

/* ─── NotificationService ─────────────────────────────────────────────── */

export type NotificationKind =
  | "otp.sms"
  | "security.lockout.email"
  | "nin.validated.email"
  | "nin.failed.email";

export interface NotificationService {
  send(input: {
    kind: NotificationKind;
    to: { phone?: string; email?: string };
    vars: Record<string, string>;
  }): Promise<{ ok: true } | { ok: false; reason: "PROVIDER_ERROR" }>;
}

/* ─── Container ───────────────────────────────────────────────────────── */

export interface ServiceContainer {
  member: MemberService;
  nin: NinService;
  otp: OtpService;
  prognosis: PrognosisService;
  notification: NotificationService;
}
