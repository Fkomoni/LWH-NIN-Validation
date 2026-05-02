import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { getQuickState } from "@/server/quickSession";
import { getAllEnrolleesByPhone } from "@/services/http/PrognosisMemberClient";
import { QuickPickProfilesForm } from "./QuickPickProfilesForm";

export const metadata = { title: "Pick profiles — Leadway Health" };

export default async function QuickProfilesPage() {
  const state = await getQuickState();
  if (!state || state.step !== "PROFILE_PICK") redirect("/quick");

  const profiles = await getAllEnrolleesByPhone(state.phone).catch(() => []);

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Multiple profiles found
          </p>
          <h1 className="text-2xl font-bold">Which profiles should we update?</h1>
          <p className="text-sm text-muted-foreground">
            Your phone number is registered against more than one Leadway plan.
            Tick the ones you want this NIN to be saved against.
          </p>
        </div>
        <QuickPickProfilesForm
          profiles={profiles.map((p) => ({
            enrolleeId: p.enrolleeId,
            fullName: p.fullName,
            relationship: p.relationship ?? "",
          }))}
        />
        <SupportBlock />
      </div>
    </PageShell>
  );
}
