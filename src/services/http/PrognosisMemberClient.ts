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
 * The response body shapes are provider-defined. We do not invent them;
 * we read the conservative subset we need (name, DOB, phone, gender,
 * status), accept multiple casings/aliases, and surface a structured
 * error if the response is missing the keys we need. TODO(client):
 * confirm exact field names + dependant-id representation.
 */

export interface PrognosisMember {
  enrolleeId: string;
  fullName: string;
  dob?: string;
  phone?: string;
  gender?: string;
  relationship?: string;
  ninStatus?: string;
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
  const direct = str(b, ["FullName", "fullName", "full_name", "Name", "name"]);
  if (direct) return direct;
  const first = str(b, ["FirstName", "firstname", "firstName"]);
  const middle = str(b, ["MiddleName", "middlename", "middleName"]);
  const last = str(b, ["LastName", "lastname", "lastName", "Surname", "surname"]);
  const parts = [first, middle, last].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function mapMember(b: Body, fallbackId: string): PrognosisMember | null {
  const fullName = fullNameFromBody(b);
  if (!fullName) return null;
  return {
    enrolleeId: str(b, ["EnrolleeID", "enrolleeId", "EnrolleeId", "enrolleeid", "Enrolleeid"]) ?? fallbackId,
    fullName,
    dob: normaliseDob(str(b, ["DateOfBirth", "dateOfBirth", "DOB", "dob", "BirthDate"])),
    phone: str(b, [
      "Phone",
      "phone",
      "PhoneNumber",
      "PHoneNumber", // Prognosis ships this exact casing
      "phoneNumber",
      "MobileNumber",
      "mobileNumber",
    ]),
    gender: str(b, ["Gender", "gender", "Sex", "sex"]),
    relationship: str(b, ["Relationship", "relationship"]),
    ninStatus: str(b, ["NinStatus", "ninStatus", "NINStatus"]),
  };
}

function unwrap(body: unknown): Body | Body[] {
  if (Array.isArray(body)) return body as Body[];
  if (body && typeof body === "object") {
    const b = body as Body;
    if (Array.isArray(b.data)) return b.data as Body[];
    if (b.data && typeof b.data === "object") return b.data as Body;
    return b;
  }
  return {};
}

async function authed(url: string): Promise<unknown> {
  const token = await getPrognosisToken();
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`prognosis.http-${res.status}`);
  }
  return res.json();
}

export async function getEnrolleeBioData(enrolleeId: string): Promise<PrognosisMember | null> {
  const base = process.env.PROGNOSIS_BASE_URL;
  if (!base) throw new Error("prognosis.missing-base-url");
  const url = `${base}/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID?enrolleeid=${encodeURIComponent(enrolleeId)}`;
  try {
    const body = unwrap(await authed(url));
    const one = Array.isArray(body) ? body[0] : body;
    if (!one) return null;
    return mapMember(one, enrolleeId);
  } catch (err) {
    log.error({ err: String(err), enrolleeId }, "prognosis.bio.fail");
    return null;
  }
}

export async function getEnrolleeDependants(enrolleeId: string): Promise<PrognosisMember[]> {
  const base = process.env.PROGNOSIS_BASE_URL;
  if (!base) throw new Error("prognosis.missing-base-url");
  const url = `${base}/EnrolleeProfile/GetEnrolleeDependantsByEnrolleeID?enrolleeid=${encodeURIComponent(enrolleeId)}`;
  try {
    const body = unwrap(await authed(url));
    const list = Array.isArray(body) ? body : [body];
    return list.map((b, i) => mapMember(b, `${enrolleeId}-D${i + 1}`)).filter((m): m is PrognosisMember => m !== null);
  } catch (err) {
    log.error({ err: String(err), enrolleeId }, "prognosis.deps.fail");
    return [];
  }
}
