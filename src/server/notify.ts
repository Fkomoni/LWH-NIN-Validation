import "server-only";
import { getServices } from "@/services";
import { getEnrolleeBioData } from "@/services/http/PrognosisMemberClient";
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
    log.error({ reason: res.reason, enrolleeId: args.enrolleeId }, "security.email.failed");
  }
}

/**
 * Confirmation email after a successful NIN validation + Prognosis
 * write. Always addressed to the **principal** (authenticated user),
 * with the body naming the exact beneficiary whose NIN was updated.
 *
 * Principal email + name are fetched from Prognosis so the caller
 * doesn't need to propagate those through the service layer.
 */
export async function notifyNinValidated(args: {
  principalEnrolleeId: string;
  beneficiaryName: string;
}): Promise<void> {
  if (!appConfig.sendReceiptEmail) {
    log.info({}, "notify.nin-validated.disabled");
    return;
  }

  try {
    log.info({ enrolleeId: args.principalEnrolleeId }, "notify.nin-validated.start");

    const principalBio = await getEnrolleeBioData(args.principalEnrolleeId);
    if (!principalBio) {
      log.warn(
        { enrolleeId: args.principalEnrolleeId },
        "notify.nin-validated.bio-lookup-failed",
      );
      return;
    }

    if (!principalBio.email) {
      log.info(
        { enrolleeId: args.principalEnrolleeId, hasBio: true, fullName: !!principalBio.fullName },
        "notify.nin-validated.no-email-on-file",
      );
      return;
    }

    log.info(
      {
        enrolleeId: args.principalEnrolleeId,
        emailPrefix: principalBio.email.split("@")[0]?.slice(0, 2) + "***",
        emailDomain: principalBio.email.split("@")[1] ?? null,
      },
      "notify.nin-validated.dispatching",
    );

    const res = await getServices().notification.send({
      kind: "nin.validated.email",
      to: { email: principalBio.email },
      vars: {
        principalName: principalBio.fullName,
        beneficiaryName: args.beneficiaryName,
      },
    });

    if (res.ok) {
      log.info(
        { enrolleeId: args.principalEnrolleeId },
        "notify.nin-validated.sent",
      );
    } else {
      log.error(
        { reason: res.reason, enrolleeId: args.principalEnrolleeId },
        "notify.nin-validated.fail",
      );
    }
  } catch (err) {
    log.error(
      { err: String(err), enrolleeId: args.principalEnrolleeId },
      "notify.nin-validated.exception",
    );
  }
}
