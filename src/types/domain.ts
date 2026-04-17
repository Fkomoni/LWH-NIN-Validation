/**
 * Core domain types. The interfaces here are UI/service contracts — they
 * describe what the portal expects regardless of the underlying core system.
 * Phase 2 may introduce a separate Prognosis-specific DTO layer.
 */

export type Relationship = "PRINCIPAL" | "SPOUSE" | "CHILD" | "PARENT" | "OTHER";

export type NinStatus =
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "VALIDATING"
  | "VALIDATED"
  | "FAILED"
  | "UPDATED"
  | "MANUAL_REVIEW";

export interface Person {
  id: string;
  enrolleeId: string;
  fullName: string;
  relationship: Relationship;
  dob: string; // ISO date
  phoneMasked?: string;
  ninStatus: NinStatus;
  ninLast3?: string;
}

export interface Household {
  principal: Person;
  dependants: Person[];
}

export type NinOutcome =
  | "PASS_AUTO"
  | "REVIEW_SOFT"
  | "FAIL_HARD"
  | "PROVIDER_ERROR"
  | "TIMEOUT";

export interface NinValidationResult {
  outcome: NinOutcome;
  nameScore?: number;
  dobMatched?: boolean;
  verifiedFullName?: string;
  dobFromNin?: string;
  message: string;
  supportRef?: string;
}

export interface AuthSession {
  enrolleeId: string;
  /** Wall-clock when the session was first issued (bounds absoluteMs). */
  authedAt: string;
  /** Wall-clock of the last authenticated request (bounds idleMs). */
  lastSeenAt: string;
  channel: "DOB" | "PRINCIPAL_NIN" | "OTP";
  mocked?: boolean;
}
