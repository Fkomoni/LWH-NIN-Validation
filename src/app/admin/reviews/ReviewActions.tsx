"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resolveReviewAction } from "@/server/actions/admin";

export function ReviewActions({ id, adminId }: { id: string; adminId: string }) {
  const [, action, pending] = useActionState(resolveReviewAction, { status: "idle" as const });

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="adminId" value={adminId} />
      <Button
        type="submit"
        name="action"
        value="APPROVED"
        size="sm"
        disabled={pending}
      >
        Approve
      </Button>
      <Button
        type="submit"
        name="action"
        value="REJECTED"
        size="sm"
        variant="outline"
        disabled={pending}
      >
        Reject
      </Button>
    </form>
  );
}
