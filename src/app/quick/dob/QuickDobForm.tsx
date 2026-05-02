"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { quickConfirmDob, type QuickDobState } from "@/server/actions/quick";

const initial: QuickDobState = { status: "idle" };

export function QuickDobForm() {
  const [state, formAction, pending] = useActionState(quickConfirmDob, initial);

  const err = state.status === "error" ? state.fieldErrors ?? {} : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Field id="dob" label="Date of birth" required error={err.dob}>
        <Input name="dob" type="date" required />
      </Field>

      {state.status === "no-match" ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "error" && !err.dob ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Verifying…" : "Confirm and continue"}
        </Button>
      </div>
    </form>
  );
}
