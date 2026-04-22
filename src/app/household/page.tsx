import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Stepper } from "@/components/brand/Stepper";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { getSession } from "@/server/session";
import { getServices } from "@/services";
import { HouseholdTable } from "./HouseholdTable";

export const metadata = { title: "Your household — Leadway Health" };

export default async function HouseholdPage() {
  const session = await getSession();
  if (!session) redirect("/auth");

  const svc = getServices();
  const household = await svc.member.loadHousehold(session.enrolleeId);

  return (
    <PageShell>
      <div className="space-y-6">
        <Stepper current="household" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Your household</h1>
          <p className="text-sm text-muted-foreground">
            Enter a NIN for each person on your plan, then click{" "}
            <strong>Validate</strong>. You can also validate them one at a time.
          </p>
        </div>

        <HouseholdTable household={household} />

        <SupportBlock />
      </div>
    </PageShell>
  );
}
