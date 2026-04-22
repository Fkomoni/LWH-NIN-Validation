"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { resetMemberAction, type ResetMemberState } from "@/server/actions/admin";

const initial: ResetMemberState = { status: "idle" };

export function ResetMemberForm({ adminEmail }: { adminEmail: string }) {
  const [state, action, pending] = useActionState(resetMemberAction, initial);

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="enrolleeId" label="Enrollee ID" required>
        <Input
          name="enrolleeId"
          inputMode="text"
          autoComplete="off"
          placeholder="21000645/0"
          required
        />
      </Field>

      {state.status === "ok" ? (
        <p
          role="alert"
          className="rounded-md border border-success/40 bg-success/10 p-3 text-sm"
        >
          Cleared state for <span className="font-mono">{state.enrolleeId}</span>. They can try again immediately.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Signed in as <span className="font-mono">{adminEmail}</span>
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Clearing…" : "Reset member state"}
        </Button>
      </div>
    </form>
  );
}
