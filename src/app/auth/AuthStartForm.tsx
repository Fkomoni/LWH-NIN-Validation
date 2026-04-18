"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { authStart, type AuthStartState } from "@/server/actions/auth";
import { LockoutCountdown } from "./LockoutCountdown";

const initial: AuthStartState = { status: "idle" };

export function AuthStartForm() {
  const [state, formAction, pending] = useActionState(authStart, initial);

  const err = state.status === "error" ? state.fieldErrors ?? {} : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
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
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p className="font-medium">We couldn't match those details.</p>
          <p className="mt-1 text-muted-foreground">
            Please double-check them, or{" "}
            <Link
              href={`/verify?enrolleeId=${encodeURIComponent(state.enrolleeId)}`}
              className="text-primary underline underline-offset-2"
            >
              try another way
            </Link>
            .
          </p>
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

      {state.status === "error" && !err.enrolleeId && !err.dob && !err.consent ? (
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
