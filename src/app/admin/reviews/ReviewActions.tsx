"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resolveReviewAction } from "@/server/actions/admin";

/**
 * F-01: The actor id is derived from the signed admin cookie on the
 * server. We no longer ship `adminId` as a hidden input — the server
 * would ignore it and it was forgeable.
 */
export function ReviewActions({ id }: { id: string }) {
  const [, action, pending] = useActionState(resolveReviewAction, {
    status: "idle" as const,
  });

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
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
