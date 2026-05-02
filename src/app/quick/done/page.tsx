import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { getQuickState } from "@/server/quickSession";
import {
  quickContinueToHousehold,
  quickEnd,
} from "@/server/actions/quick";

export const metadata = { title: "All done — Leadway Health" };

export default async function QuickDonePage() {
  const state = await getQuickState();
  if (!state || state.step !== "DONE") redirect("/quick");

  const profileCount = state.selectedEnrolleeIds?.length ?? 0;

  return (
    <PageShell>
      <div className="space-y-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="h-6 w-6"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Thank you — your NIN has been updated</h1>
          <p className="text-sm text-muted-foreground">
            {profileCount > 1
              ? `Your NIN has been saved against ${profileCount} of your Leadway profiles. We've also corrected any out-of-date information on your record using your NIMC details.`
              : "Your NIN has been saved against your Leadway record. We've also corrected any out-of-date information using your NIMC details."}
          </p>
        </div>

        <div className="space-y-4 rounded-lg border bg-card p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">
              Want to update a family member&apos;s NIN too?
            </h2>
            <p className="text-sm text-muted-foreground">
              You can do this in the same session — no need to verify your
              identity again. We&apos;ll show you everyone on your plan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <form action={quickContinueToHousehold}>
              <Button type="submit" size="lg">
                Yes, update a family member
              </Button>
            </form>
            <form action={quickEnd}>
              <Button type="submit" size="lg" variant="outline">
                No, I&apos;m done
              </Button>
            </form>
          </div>
        </div>

        <SupportBlock />
      </div>
    </PageShell>
  );
}
