import "server-only";
import { getPrognosisToken } from "./PrognosisAuth";
import { log } from "@/lib/logger";

/**
 * Prognosis read clients for member + dependant lookup.
 *
 * Confirmed endpoints:
 *   GET {BASE}/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID?enrolleeid={id}
 *   GET {BASE}/EnrolleeProfile/GetEnrolleeDependantsByEnrolleeID?enrolleeid={id}
 *
 * The response body shapes are provider-defined. We read the conservative
 * subset we need (name, DOB, phone, gender, status), accept multiple
 * casings/aliases, and log response-body keys (never values) on every
 * call so it's obvious if Prognosis returns a shape we don't recognise.
 *
 * Enrollee IDs carry a `/` (e.g. `21000645/0`). The Prognosis endpoint
 * expects the raw slash in the query string — `encodeURIComponent`
 * turns it into `%2F` which silently returns an empty body. We build
 * the URL by hand; the enrollee ID has already been validated by Zod
 * against `^[A-Za-z0-9/\-]+$`.
 */

export interface PrognosisMember {
  enrolleeId: string;
  fullName: string;
  dob?: string;
  phone?: string;
  gender?: string;
  relationship?: string;
  /** Raw NIN if Prognosis already has one on file. */
  existingNin?: string;
}

type Body = Record<string, unknown>;

function str(obj: Body, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

function normaliseDob(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo?.padStart(2, "0")}-${d?.padStart(2, "0")}`;
  }
  return undefined;
}

function fullNameFromBody(b: Body): string | undefined {
  // Prognosis returns the concatenated name as `Member_CustomerName`.
  // Fall through to FirstName + othernames + Surname if that field is
  // absent, then finally to the generic Name / FullName casings.
  const customer = str(b, ["Member_CustomerName", "CustomerName"]);
  if (customer) return customer;

  const prognosisParts = [
    str(b, ["Member_FirstName"]),
    str(b, ["Member_othernames", "Member_OtherNames", "Member_MiddleName"]),
    str(b, ["Member_Surname", "Member_LastName"]),
  ].filter(Boolean);
  if (prognosisParts.length) return prognosisParts.join(" ");

  const direct = str(b, ["FullName", "fullName", "full_name", "Name", "name"]);
  if (direct) return direct;
  const first = str(b, ["FirstName", "firstname", "firstName", "Firstname"]);
  const middle = str(b, ["MiddleName", "middlename", "middleName", "Middlename"]);
  const last = str(b, ["LastName", "lastname", "lastName", "Lastname", "Surname", "surname"]);
  const parts = [first, middle, last].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function mapMember(b: Body, fallbackId: string): PrognosisMember | null {
  const fullName = fullNameFromBody(b);
  if (!fullName) return null;
  return {
    enrolleeId:
      str(b, [
        "Member_EnrolleeID",
        "EnrolleeID",
        "enrolleeId",
        "EnrolleeId",
        "enrolleeid",
        "Enrolleeid",
      ]) ?? fallbackId,
    fullName,
    dob: normaliseDob(
      str(b, [
        "Member_DateOfBirth",
        "DateOfBirth",
        "dateOfBirth",
        "DOB",
        "dob",
        "BirthDate",
      ]),
    ),
    // Prognosis carries up to five phone slots; the first non-empty wins.
    phone: str(b, [
      "Member_Phone_One",
      "Member_Phone_Two",
      "Member_Phone_Three",
      "Member_Phone_Four",
      "Member_Phone_Five",
      "Phone",
      "phone",
      "PhoneNumber",
      "PHoneNumber", // NIN-update request body ships this exact casing
      "phoneNumber",
      "MobileNumber",
      "mobileNumber",
    ]),
    gender: str(b, ["Member_Gender", "Gender", "gender", "Sex", "sex"]),
    relationship: str(b, [
      "Member_RelationshipToPrincipal",
      "RelationshipToPrincipal",
      "Relationship",
      "relationship",
    ]),
    existingNin: str(b, ["NIN", "Member_NIN", "nin"]),
  };
}

function unwrap(body: unknown): Body | Body[] {
  if (Array.isArray(body)) return body as Body[];
  if (body && typeof body === "object") {
    const b = body as Body;
    if (Array.isArray(b.data)) return b.data as Body[];
    if (b.data && typeof b.data === "object") return b.data as Body;
    if (Array.isArray(b.result)) return b.result as Body[];
    if (b.result && typeof b.result === "object") return b.result as Body;
    if (Array.isArray(b.Data)) return b.Data as Body[];
    return b;
  }
  return {};
}

function bodyKeys(body: unknown): string[] {
  if (Array.isArray(body)) {
    const first = body[0];
    return first && typeof first === "object" && first !== null
      ? Object.keys(first)
      : [];
  }
  if (body && typeof body === "object") return Object.keys(body as Body);
  return [];
}

async function authedGet(url: string): Promise<{ status: number; body: unknown }> {
  const token = await getPrognosisToken();
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export class PrognosisProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "PrognosisProviderError";
  }
}

export async function getEnrolleeBioData(enrolleeId: string): Promise<PrognosisMember | null> {
  const base = process.env.PROGNOSIS_BASE_URL;
  if (!base) throw new PrognosisProviderError("prognosis.missing-base-url");

  // Do NOT encodeURIComponent — the Prognosis endpoint expects the raw
  // slash in the enrollee ID.
  const url = `${base}/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID?enrolleeid=${enrolleeId}`;

  let status: number;
  let body: unknown;
  try {
    ({ status, body } = await authedGet(url));
  } catch (err) {
    log.error({ err: String(err), enrolleeId }, "prognosis.bio.network-fail");
    throw new PrognosisProviderError(String(err));
  }

  log.info(
    {
      path: "/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID",
      status,
      keys: bodyKeys(body),
      enrolleeId,
    },
    "prognosis.bio.response",
  );

  if (status === 401 || status === 403) {
    throw new PrognosisProviderError(`prognosis.bio.auth-${status}`, status);
  }
  if (status >= 500) {
    throw new PrognosisProviderError(`prognosis.bio.http-${status}`, status);
  }
  if (status === 404) return null;
  if (status >= 400) {
    throw new PrognosisProviderError(`prognosis.bio.http-${status}`, status);
  }

  const unwrapped = unwrap(body);
  const one = Array.isArray(unwrapped) ? unwrapped[0] : unwrapped;
  if (!one) return null;

  const member = mapMember(one, enrolleeId);
  if (!member) {
    // We got a 200 with a body but none of our extractors matched. Log
    // the keys so we can update the extractor without leaking values.
    log.warn(
      { enrolleeId, keys: Object.keys(one) },
      "prognosis.bio.unrecognised-shape",
    );
  }
  return member;
}

export async function getEnrolleeDependants(enrolleeId: string): Promise<PrognosisMember[]> {
  const base = process.env.PROGNOSIS_BASE_URL;
  if (!base) throw new PrognosisProviderError("prognosis.missing-base-url");

  const url = `${base}/EnrolleeProfile/GetEnrolleeDependantsByEnrolleeID?enrolleeid=${enrolleeId}`;

  let status: number;
  let body: unknown;
  try {
    ({ status, body } = await authedGet(url));
  } catch (err) {
    log.error({ err: String(err), enrolleeId }, "prognosis.deps.network-fail");
    return [];
  }

  log.info(
    { path: "/EnrolleeProfile/GetEnrolleeDependantsByEnrolleeID", status, keys: bodyKeys(body), enrolleeId },
    "prognosis.deps.response",
  );

  if (!status || status >= 400) return [];

  const unwrapped = unwrap(body);
  const list = Array.isArray(unwrapped) ? unwrapped : [unwrapped];
  return list
    .map((b, i) => mapMember(b, `${enrolleeId}-D${i + 1}`))
    .filter((m): m is PrognosisMember => m !== null);
}
