"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  quickVerifyOtp,
  quickResendOtp,
  quickOtpFallbackToDob,
  type QuickOtpState,
  type QuickOtpDobState,
} from "@/server/actions/quick";

const initial: QuickOtpState = { status: "idle" };
const dobInitial: QuickOtpDobState = { status: "idle" };

const OTP_TTL_MS = 5 * 60 * 1000;
const DOB_PROMPT_AT_MS = 2 * 60 * 1000;

function fmt(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function QuickOtpForm({ otpSentAt }: { otpSentAt: number }) {
  const [state, formAction, pending] = useActionState(quickVerifyOtp, initial);
  const [dobState, dobFormAction, dobPending] = useActionState(
    quickOtpFallbackToDob,
    dobInitial,
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [showDobFallback, setShowDobFallback] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = now - otpSentAt;
  const remainingMs = Math.max(0, OTP_TTL_MS - elapsed);
  const remainingSec = Math.floor(remainingMs / 1000);
  const showFallbackPrompt = elapsed >= DOB_PROMPT_AT_MS;
  const expired = remainingMs <= 0;

  const err = state.status === "error" ? state.fieldErrors ?? {} : {};
  const dobErr = dobState.status === "error" ? dobState.fieldErrors ?? {} : {};

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-5" noValidate>
        <Field id="code" label="6-digit code" required error={err.code}>
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="123456"
            required
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          {expired ? (
            <span className="font-medium text-destructive">
              The code has expired. Send a new one below.
            </span>
          ) : (
            <>
              Code expires in{" "}
              <span className="font-mono font-semibold text-foreground">
                {fmt(remainingSec)}
              </span>
            </>
          )}
        </p>

        {state.status === "expired" ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            That code has expired. Please request a new one.
          </p>
        ) : null}
        {state.status === "exhausted" ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            Too many wrong attempts. Please request a new code.
          </p>
        ) : null}
        {state.status === "error" && !err.code ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.message}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button type="submit" disabled={pending || expired} size="lg">
            {pending ? "Verifying…" : "Continue"}
          </Button>
        </div>
      </form>

      {showFallbackPrompt && !showDobFallback ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">
            Haven&apos;t got the code yet?
          </p>
          <p className="mt-1 text-amber-900">
            You can use your date of birth to log in instead, or wait{" "}
            {fmt(remainingSec)} for the code to expire and request a new one.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDobFallback(true)}
            >
              Use my date of birth instead
            </Button>
            <form action={quickResendOtp}>
              <Button type="submit" size="sm" variant="outline" disabled={!expired}>
                {expired ? "Send new code" : `Send new code (in ${fmt(remainingSec)})`}
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      {showDobFallback ? (
        <form
          action={dobFormAction}
          className="space-y-4 rounded-md border bg-card p-4"
          noValidate
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold">Sign in with your date of birth</p>
            <p className="text-xs text-muted-foreground">
              We&apos;ll match it against the date of birth on your Leadway record.
            </p>
          </div>
          <Field id="dob-fallback" label="Date of birth" required error={dobErr.dob}>
            <Input name="dob" type="date" required />
          </Field>

          {dobState.status === "no-match" ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {dobState.message}
            </p>
          ) : null}
          {dobState.status === "error" && !dobErr.dob ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {dobState.message}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowDobFallback(false)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Back to code entry
            </button>
            <Button type="submit" disabled={dobPending}>
              {dobPending ? "Checking…" : "Continue"}
            </Button>
          </div>
        </form>
      ) : null}

      {!showFallbackPrompt ? (
        <p className="text-xs text-muted-foreground">
          Didn&apos;t get it? You&apos;ll be able to retry or sign in with your
          date of birth shortly.
        </p>
      ) : null}
    </div>
  );
}
