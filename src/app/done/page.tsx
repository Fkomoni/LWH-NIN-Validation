import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Stepper } from "@/components/brand/Stepper";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/brand/StatusChip";
import { getSession } from "@/server/session";
import { getServices } from "@/services";
import { logout } from "@/server/actions/logout";

export const metadata = { title: "All done — Leadway Health" };

export default async function DonePage() {
  const session = await getSession();
  if (!session) redirect("/auth");
  const svc = getServices();
  const household = await svc.member.loadHousehold(session.enrolleeId);
  const people = [household.principal, ...household.dependants];

  return (
    <PageShell>
      <div className="space-y-6">
        <Stepper current="done" />
        <div className="flex items-start gap-3 rounded-md border border-success/40 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
          <div>
            <h1 className="text-xl font-bold">Thanks — we've got your NIN update.</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Anything still showing as <em>Manual review</em> or <em>Failed</em> will
              be followed up by our team. You don't need to do anything else today.
            </p>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Summary</h2>
          <ul className="divide-y rounded-lg border">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{p.fullName}</p>
                  <p className="text-xs text-muted-foreground">{p.relationship.toLowerCase()}</p>
                </div>
                <StatusChip status={p.ninStatus} />
              </li>
            ))}
          </ul>
        </section>

        <div className="flex justify-end gap-3">
          <form action={logout}>
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
          <Button asChild>
            <Link href="/household">Back to household</Link>
          </Button>
        </div>

        <SupportBlock />
      </div>
    </PageShell>
  );
}
