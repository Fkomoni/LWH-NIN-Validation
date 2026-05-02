"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { quickSubmitNin, type QuickNinState } from "@/server/actions/quick";

const initial: QuickNinState = { status: "idle" };

export function QuickNinForm() {
  const [state, formAction, pending] = useActionState(quickSubmitNin, initial);

  const err = state.status === "error" ? state.fieldErrors ?? {} : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Field
        id="nin"
        label="National Identification Number (NIN)"
        hint="11 digits, no spaces."
        required
        error={err.nin}
      >
        <Input
          name="nin"
          inputMode="numeric"
          maxLength={11}
          pattern="[0-9]{11}"
          placeholder="00000000000"
          autoComplete="off"
          required
        />
      </Field>

      {state.status === "provider-error" ? (
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
          You&apos;ve tried too many times in a row. Please wait a minute and
          try again.
        </p>
      ) : null}

      {state.status === "error" && !err.nin ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Verifying with NIMC…" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
