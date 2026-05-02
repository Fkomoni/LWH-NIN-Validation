"use client";

import { Button } from "@/components/ui/button";
import { removeAdminAction } from "@/server/actions/admin";

export function RemoveAdminButton({ email }: { email: string }) {
  return (
    <form action={removeAdminAction}>
      <input type="hidden" name="email" value={email} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        onClick={(e) => {
          if (!confirm(`Remove ${email} from the admin allowlist?`)) {
            e.preventDefault();
          }
        }}
      >
        Remove
      </Button>
    </form>
  );
}
