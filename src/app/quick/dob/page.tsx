import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { getQuickState } from "@/server/quickSession";
import { QuickDobForm } from "./QuickDobForm";

export const metadata = { title: "Confirm date of birth — Leadway Health" };

export default async function QuickDobPage() {
  const state = await getQuickState();
  if (!state || state.step !== "DOB_FALLBACK") redirect("/quick");

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Quick check
          </p>
          <h1 className="text-2xl font-bold">Please confirm your date of birth</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t exactly match the name on your NIN to your Leadway
            record (this happens with married names, abbreviations, etc.). To
            confirm it&apos;s really you, please enter the date of birth on
            your NIN.
          </p>
        </div>
        <QuickDobForm />
        <SupportBlock />
      </div>
    </PageShell>
  );
}
