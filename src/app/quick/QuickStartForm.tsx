"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { quickStart, type QuickStartState } from "@/server/actions/quick";

const initial: QuickStartState = { status: "idle" };

export function QuickStartForm() {
  const [state, formAction, pending] = useActionState(quickStart, initial);

  const err = state.status === "error" ? state.fieldErrors ?? {} : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Field
        id="phone"
        label="Phone number"
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

      <label className="flex items-start gap-3 text-sm">
        <Checkbox name="consent" id="consent" />
        <span>
          I consent to Leadway Health using my NIN (and those of my
          beneficiaries) to meet NHIA requirements.
        </span>
      </label>
      {err.consent ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {err.consent}
        </p>
      ) : null}

      {state.status === "no-match" ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "rate-limited" ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground"
        >
          You&apos;ve tried too many times. Please wait a few minutes and try again.
        </p>
      ) : null}

      {state.status === "error" && !err.phone && !err.consent ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Sending code…" : "Send code"}
        </Button>
      </div>
    </form>
  );
}
