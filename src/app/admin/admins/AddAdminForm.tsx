"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { addAdminAction, type AdminAllowlistState } from "@/server/actions/admin";

const initial: AdminAllowlistState = { status: "idle" };

export function AddAdminForm() {
  const [state, formAction, pending] = useActionState(addAdminAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field id="email" label="Email" required>
          <Input
            name="email"
            type="email"
            autoComplete="off"
            placeholder="someone@leadway.com"
            required
          />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add admin"}
      </Button>
      {state.status === "ok" ? (
        <p className="self-center text-xs text-emerald-700 sm:ml-3">{state.message}</p>
      ) : null}
      {state.status === "error" ? (
        <p className="self-center text-xs text-destructive sm:ml-3">{state.message}</p>
      ) : null}
    </form>
  );
}
