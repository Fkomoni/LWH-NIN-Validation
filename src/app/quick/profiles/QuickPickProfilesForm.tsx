"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { quickPickProfiles, type QuickPickState } from "@/server/actions/quick";

const initial: QuickPickState = { status: "idle" };

interface ProfileRow {
  enrolleeId: string;
  fullName: string;
  relationship: string;
}

export function QuickPickProfilesForm({ profiles }: { profiles: ProfileRow[] }) {
  const [state, formAction, pending] = useActionState(quickPickProfiles, initial);

  return (
    <form action={formAction} className="space-y-5">
      <ul className="space-y-2">
        {profiles.map((p) => (
          <li
            key={p.enrolleeId}
            className="flex items-start gap-3 rounded-lg border p-3 hover:border-primary/50"
          >
            <Checkbox
              id={`prof-${p.enrolleeId}`}
              name="enrolleeId"
              value={p.enrolleeId}
              defaultChecked
            />
            <label
              htmlFor={`prof-${p.enrolleeId}`}
              className="flex-1 cursor-pointer"
            >
              <p className="font-medium">{p.fullName}</p>
              <p className="text-xs text-muted-foreground">
                Enrollee ID: <span className="font-mono">{p.enrolleeId}</span>
                {p.relationship ? ` · ${p.relationship}` : ""}
              </p>
            </label>
          </li>
        ))}
      </ul>

      {state.status === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Continuing…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
