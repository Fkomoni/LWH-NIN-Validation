import "server-only";
import type { NotificationService } from "../types";
import { sendEmail, sendSms } from "../http/PrognosisNotifyClient";
import { log } from "@/lib/logger";
import { appConfig } from "@/config/app";

/**
 * Production NotificationService. Templates live here rather than in
 * the Prognosis service so we don't rely on TemplateIds we haven't
 * confirmed; Phase 2 can move these into the Prognosis template system
 * once we know the numeric mapping.
 */

interface Vars {
  [k: string]: string;
}

function renderOtpSms(vars: Vars): string {
  return `Your Leadway Health verification code is ${vars.code}. It expires in 5 minutes. Do not share this code.`;
}

function renderLockoutEmail(vars: Vars): { subject: string; body: string } {
  return {
    subject: `[LWH Portal] Account locked — ${vars.enrolleeId}`,
    body: [
      `Enrollee ID: ${vars.enrolleeId}`,
      `Channel: ${vars.channel}`,
      `Attempts in window: ${vars.attempts}`,
      `Lock duration: ${vars.lockDurationHours}h`,
      `Timestamp (${appConfig.timezone}): ${vars.when}`,
      `IP: ${vars.ip}`,
      `User-Agent: ${vars.userAgent}`,
    ].join("\n"),
  };
}

function renderValidatedEmail(vars: Vars): { subject: string; body: string } {
  const principal = vars.principalName ?? vars.fullName ?? "there";
  const beneficiary = vars.beneficiaryName ?? vars.fullName ?? "this member";
  return {
    subject: `NIN update successful for ${beneficiary} — Leadway Health`,
    body: [
      `Hi ${principal},`,
      ``,
      `Thank you for taking the time to complete the NIN update exercise.`,
      ``,
      `We're writing to confirm that the National Identity Number (NIN) for ${beneficiary} has been successfully verified and updated on your Leadway Health plan.`,
      ``,
      `No further action is needed. If you did not request this update, please contact our support team immediately.`,
      ``,
      `Email: ${appConfig.contact.supportEmail}`,
      `Call Centre: ${appConfig.contact.supportPhone}`,
      ``,
      `The Leadway Health Team`,
    ].join("\n"),
  };
}

function renderFailedEmail(vars: Vars): { subject: string; body: string } {
  return {
    subject: `Leadway Health — NIN validation needs attention`,
    body: `Hi ${vars.fullName},\n\nWe couldn't verify the NIN you submitted. Please contact Leadway Support with reference ${vars.supportRef ?? ""} to complete your NIN update.\n\nLeadway Health`,
  };
}

export const realNotificationService: NotificationService = {
  async send({ kind, to, vars }) {
    try {
      if (kind === "otp.sms") {
        if (!to.phone) return { ok: false, reason: "PROVIDER_ERROR" };
        const ok = await sendSms({ to: to.phone, message: renderOtpSms(vars), templateId: 5 });
        return ok ? { ok: true } : { ok: false, reason: "PROVIDER_ERROR" };
      }
      if (kind === "security.lockout.email") {
        if (!to.email) return { ok: false, reason: "PROVIDER_ERROR" };
        const { subject, body } = renderLockoutEmail(vars);
        const ok = await sendEmail({ to: to.email, subject, message: body, transactionType: "Security" });
        return ok ? { ok: true } : { ok: false, reason: "PROVIDER_ERROR" };
      }
      if (kind === "nin.validated.email") {
        if (!to.email) return { ok: true }; // silent: no email on file
        const { subject, body } = renderValidatedEmail(vars);
        const ok = await sendEmail({ to: to.email, subject, message: body });
        return ok ? { ok: true } : { ok: false, reason: "PROVIDER_ERROR" };
      }
      if (kind === "nin.failed.email") {
        if (!to.email) return { ok: true };
        const { subject, body } = renderFailedEmail(vars);
        const ok = await sendEmail({ to: to.email, subject, message: body });
        return ok ? { ok: true } : { ok: false, reason: "PROVIDER_ERROR" };
      }
      return { ok: false, reason: "PROVIDER_ERROR" };
    } catch (err) {
      log.error({ err: String(err), kind }, "notify.fail");
      return { ok: false, reason: "PROVIDER_ERROR" };
    }
  },
};
