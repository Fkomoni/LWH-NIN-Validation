"use client";

import Link from "next/link";
import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { authStart, type AuthStartState } from "@/server/actions/auth";
import { LockoutCountdown } from "./LockoutCountdown";

const initial: AuthStartState = { status: "idle" };

type LoginMethod = "enrolleeId" | "phone";

export function AuthStartForm() {
  const [state, formAction, pending] = useActionState(authStart, initial);
  const [method, setMethod] = useState<LoginMethod>("enrolleeId");

  const err = state.status === "error" ? state.fieldErrors ?? {} : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* hidden field so the server action knows which path to use */}
      <input type="hidden" name="loginMethod" value={method} />

      {/* login method toggle */}
      <div className="flex rounded-lg border p-1 gap-1">
        <button
          type="button"
          onClick={() => setMethod("enrolleeId")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            method === "enrolleeId"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Enrollee ID
        </button>
        <button
          type="button"
          onClick={() => setMethod("phone")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            method === "phone"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Phone Number
        </button>
      </div>

      {method === "enrolleeId" ? (
        <Field
          id="enrolleeId"
          label="Enrollee ID"
          hint="Enter your full Enrollee ID including any / suffix. Case-insensitive."
          required
          error={err.enrolleeId}
        >
          <Input
            name="enrolleeId"
            autoComplete="off"
            inputMode="text"
            required
          />
        </Field>
      ) : (
        <Field
          id="phone"
          label="Phone Number"
          hint="The number registered with Leadway Health (e.g. 08090700956)."
          required
          error={err.phone}
        >
          <Input
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="08090700956"
            required
          />
        </Field>
      )}

      <Field id="dob" label="Date of birth" required error={err.dob}>
        <Input name="dob" type="date" required />
      </Field>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox name="consent" id="consent" />
        <span>
          I consent to Leadway Health using my NIN (and those of my
          beneficiaries) to meet NHIA requirements, as set out in the notice
          above.
        </span>
      </label>
      {err.consent ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {err.consent}
        </p>
      ) : null}

      {state.status === "dob-mismatch" ? (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-semibold text-destructive">Validation Error</p>
          <p className="text-foreground">{state.message}</p>
          {state.attemptsRemaining > 0 ? (
            <p className="font-medium text-destructive">
              {state.attemptsRemaining === 1
                ? "Warning: 1 attempt remaining before your account is locked for 48 hours."
                : `${state.attemptsRemaining} attempts remaining before your account is locked for 48 hours.`}
            </p>
          ) : null}
          {state.enrolleeId ? (
            <p className="text-muted-foreground">
              Please double-check the date, or{" "}
              <Link
                href={`/verify?enrolleeId=${encodeURIComponent(state.enrolleeId)}`}
                className="text-primary underline underline-offset-2"
              >
                try another way
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === "locked" ? (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-semibold text-destructive">
            For security, we&apos;ve paused this account for 48 hours.
          </p>
          <p className="text-foreground">
            Too many unsuccessful sign-in attempts. Please try again in{" "}
            <LockoutCountdown expiresAt={state.expiresAt} />. If you think this
            is a mistake, contact Leadway Support.
          </p>
        </div>
      ) : null}

      {state.status === "error" && !err.enrolleeId && !err.phone && !err.dob && !err.consent ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Checking…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
