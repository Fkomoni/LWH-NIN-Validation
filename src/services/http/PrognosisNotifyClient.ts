import "server-only";
import { getPrognosisToken } from "./PrognosisAuth";
import { log } from "@/lib/logger";

/**
 * Prognosis notification clients.
 *
 * Confirmed endpoints (17 Apr 2026):
 *   POST {BASE}/Sms/SendSms
 *     { To, Message, Source, SourceId, TemplateId, PolicyNumber, ReferenceNo, UserId }
 *   POST {BASE}/EnrolleeProfile/SendEmailAlert
 *     { EmailAddress, CC, BCC, Subject, MessageBody, Attachments, Category,
 *       UserId, ProviderId, ServiceId, Reference, TransactionType }
 *
 * TODO(client): confirm the correct `TemplateId` for OTP SMS (currently 5).
 */

const EMAIL_PATH = "/EnrolleeProfile/SendEmailAlert";

async function authedPost<T = unknown>(path: string, body: unknown): Promise<T | null> {
  const base = process.env.PROGNOSIS_BASE_URL;
  if (!base) throw new Error("prognosis.missing-base-url");
  const token = await getPrognosisToken();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    log.error({ path, status: res.status }, "prognosis.notify.http-fail");
    return null;
  }
  return (await res.json().catch(() => null)) as T | null;
}

export interface SendSmsArgs {
  to: string;
  message: string;
  templateId?: number;
  source?: string;
  policyNumber?: string;
  referenceNo?: string;
}

export async function sendSms(args: SendSmsArgs): Promise<boolean> {
  const body = {
    To: args.to,
    Message: args.message,
    Source: args.source ?? "LWH-NIN-Portal",
    SourceId: 1,
    TemplateId: args.templateId ?? 5,
    PolicyNumber: args.policyNumber ?? "",
    ReferenceNo: args.referenceNo ?? "",
    UserId: 0,
  };
  return (await authedPost("/Sms/SendSms", body)) !== null;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  message: string;
  cc?: string;
  bcc?: string;
  reference?: string;
  transactionType?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  const body = {
    EmailAddress: args.to,
    CC: args.cc ?? "",
    BCC: args.bcc ?? "",
    Subject: args.subject,
    MessageBody: args.message,
    Attachments: null,
    Category: "",
    UserId: 0,
    ProviderId: 0,
    ServiceId: 0,
    Reference: args.reference ?? "",
    TransactionType: args.transactionType ?? "NIN-Portal",
  };
  return (await authedPost(EMAIL_PATH, body)) !== null;
}
