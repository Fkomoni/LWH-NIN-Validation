"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  otpRequest,
  otpVerify,
  type OtpRequestState,
  type OtpVerifyState,
} from "@/server/actions/otp";

const reqInit: OtpRequestState = { status: "idle" };
const vfyInit: OtpVerifyState = { status: "idle" };

export function OtpPanel({ enrolleeId }: { enrolleeId: string }) {
  const [reqState, requestAction, reqPending] = useActionState(otpRequest, reqInit);
  const [vfyState, verifyAction, vfyPending] = useActionState(otpVerify, vfyInit);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (reqState.status !== "sent") return;
    setCooldownLeft(Math.ceil(reqState.cooldownMs / 1000));
  }, [reqState]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setTimeout(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldownLeft]);

  return (
    <div className="space-y-6">
      <form action={requestAction} className="space-y-3">
        <input type="hidden" name="enrolleeId" value={enrolleeId} />
        <Button type="submit" variant="outline" disabled={reqPending || cooldownLeft > 0}>
          {reqPending
            ? "Sending…"
            : reqState.status === "sent"
              ? cooldownLeft > 0
                ? `Resend in ${cooldownLeft}s`
                : "Resend code"
              : "Send OTP"}
        </Button>
        {reqState.status === "sent" ? (
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to the {reqState.channelHint}. It expires in 5 minutes.
          </p>
        ) : null}
        {reqState.status === "no-phone" ? (
          <p className="text-sm text-destructive">
            We don't have a phone number on file for this account. Please contact support.
          </p>
        ) : null}
        {reqState.status === "rate-limited" ? (
          <p className="text-sm text-destructive">
            You've requested too many codes. Please try again later.
          </p>
        ) : null}
        {reqState.status === "locked" ? (
          <p className="text-sm text-destructive">
            For security, we've paused this account. Please contact Leadway Support.
          </p>
        ) : null}
      </form>

      <form action={verifyAction} className="space-y-4" noValidate>
        <input type="hidden" name="enrolleeId" value={enrolleeId} />
        <Field id="code" label="Enter 6-digit code" required>
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            placeholder="••••••"
            required
          />
        </Field>
        {vfyState.status === "invalid" ? (
          <p role="alert" className="text-sm text-destructive">
            That code isn't right. Please try again.
          </p>
        ) : null}
        {vfyState.status === "expired" ? (
          <p role="alert" className="text-sm text-destructive">
            That code has expired. Request a new one.
          </p>
        ) : null}
        {vfyState.status === "locked" ? (
          <p role="alert" className="text-sm text-destructive">
            For security, we've paused this account.
          </p>
        ) : null}
        {vfyState.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {vfyState.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={vfyPending}>
            {vfyPending ? "Verifying…" : "Verify and continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
