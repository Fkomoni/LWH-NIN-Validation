import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { getQuickState } from "@/server/quickSession";
import { QuickNinForm } from "./QuickNinForm";

export const metadata = { title: "Enter your NIN — Leadway Health" };

export default async function QuickNinPage() {
  const state = await getQuickState();
  if (!state || state.step !== "NIN") redirect("/quick");

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Step 3 of 3
          </p>
          <h1 className="text-2xl font-bold">Enter your NIN</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ll check it with NIMC and update your Leadway record. Your
            NIN is 11 digits — find it on your NIMC slip or in the SMS you
            received from NIMC.
          </p>
        </div>
        <QuickNinForm />
        <SupportBlock />
      </div>
    </PageShell>
  );
}
