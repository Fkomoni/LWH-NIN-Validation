"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Turnstile } from "@/components/security/Turnstile";
import { adminLogin, type AdminLoginState } from "@/server/actions/admin";

const initial: AdminLoginState = { status: "idle" };

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLogin, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="email" label="Email" required>
        <Input name="email" type="email" autoComplete="username" required />
      </Field>
      <Field id="password" label="Password" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.status === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "rate-limited" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          Too many attempts from this IP or email. Please wait a few minutes and try again.
        </p>
      ) : null}
      <Turnstile action="admin-login" />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}
