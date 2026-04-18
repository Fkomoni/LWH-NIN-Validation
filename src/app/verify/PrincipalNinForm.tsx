"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { authByPrincipalNin, type PrincipalNinState } from "@/server/actions/auth";
import { LockoutCountdown } from "@/app/auth/LockoutCountdown";

const initial: PrincipalNinState = { status: "idle" };

export function PrincipalNinForm({ enrolleeId }: { enrolleeId: string }) {
  const [state, action, pending] = useActionState(authByPrincipalNin, initial);
  const err = state.status === "error" ? state.fieldErrors ?? {} : {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="enrolleeId" value={enrolleeId} />
      <Field id="nin" label="Your NIN" hint="11 digits, numbers only." required error={err.nin}>
        <Input
          name="nin"
          inputMode="numeric"
          pattern="\d{11}"
          maxLength={11}
          placeholder="12345678901"
          required
        />
      </Field>
      <Field id="dob" label="Date of birth" required error={err.dob}>
        <Input name="dob" type="date" required />
      </Field>

      {state.status === "fail" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {state.message ?? "We couldn't verify those details. Please double-check and try again."}
        </p>
      ) : null}
      {state.status === "rate-limited" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Too many attempts. Please wait a minute and try again.
        </p>
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

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Checking…" : "Validate with NIN"}
        </Button>
      </div>
    </form>
  );
}
