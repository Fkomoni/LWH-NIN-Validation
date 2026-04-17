import "server-only";
import { getServices } from "@/services";
import { appConfig } from "@/config/app";
import { log } from "@/lib/logger";

/**
 * Side-effect helpers for notifications that fire at specific junctures.
 * Delegates to NotificationService for actual send; this file owns the
 * template variables and recipient wiring.
 */

export async function notifyLockout(args: {
  enrolleeId: string;
  channel: "DOB" | "PRINCIPAL_NIN" | "OTP";
  attempts: number;
  ip: string;
  userAgent: string;
}): Promise<void> {
  const svc = getServices();
  const when = new Intl.DateTimeFormat("en-NG", {
    timeZone: appConfig.timezone,
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());

  const vars = {
    enrolleeId: args.enrolleeId,
    channel: args.channel,
    attempts: String(args.attempts),
    lockDurationHours: String(Math.round(appConfig.lockout.hardLockMs / 3_600_000)),
    when,
    ip: args.ip,
    userAgent: args.userAgent,
  };

  const res = await svc.notification.send({
    kind: "security.lockout.email",
    to: { email: appConfig.contact.securityOpsEmail },
    vars,
  });
  if (!res.ok) {
    // Don't bubble — lockout itself must still succeed. Surface in the log.
    log.error({ reason: res.reason, enrolleeId: args.enrolleeId }, "security.email.failed");
  }
}

export async function notifyNinValidated(args: {
  email?: string;
  phone?: string;
  fullName: string;
}): Promise<void> {
  if (!args.email && !args.phone) return;
  await getServices().notification.send({
    kind: "nin.validated.email",
    to: { email: args.email, phone: args.phone },
    vars: { fullName: args.fullName },
  });
}
