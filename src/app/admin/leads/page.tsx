import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { getAdminSession } from "@/server/admin/session";
import {
  listLeads,
  classifyDropOff,
  dropOffLabel,
  type DropOffStage,
} from "@/server/leads";
import { maskPhoneForDisplay } from "@/server/phoneOtp";

export const metadata = { title: "Drop-off list — Leadway Health" };

const FILTERS: Array<{ key: DropOffStage | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "after-phone", label: "Dropped after phone" },
  { key: "after-otp", label: "Dropped after OTP" },
  { key: "after-nin-attempt", label: "Dropped after NIN" },
  { key: "completed", label: "Completed" },
];

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PageProps {
  searchParams: Promise<{ stage?: string }>;
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const me = await getAdminSession();
  if (!me) redirect("/admin/login");

  const params = await searchParams;
  const stageFilter = (params?.stage ?? "all") as DropOffStage | "all";

  const leads = await listLeads(500);
  const filtered =
    stageFilter === "all"
      ? leads
      : leads.filter((l) => classifyDropOff(l) === stageFilter);

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Funnel
          </p>
          <h1 className="text-2xl font-bold">Drop-offs &amp; intervention list</h1>
          <p className="text-sm text-muted-foreground">
            Every member who started the quick-update flow, where they got to,
            and when. Use this list to follow up with members who didn&apos;t
            finish.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filter</CardTitle>
            <CardDescription>
              Showing {filtered.length} of {leads.length} leads (most recent first).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const active = stageFilter === f.key;
                return (
                  <Link
                    key={f.key}
                    href={
                      f.key === "all"
                        ? "/admin/leads"
                        : `/admin/leads?stage=${f.key}`
                    }
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {f.label}
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No leads match this filter yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Phone</th>
                      <th className="px-4 py-2 text-left">Started</th>
                      <th className="px-4 py-2 text-left">OTP verified</th>
                      <th className="px-4 py-2 text-left">NIN attempted</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Profiles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((l) => {
                      const stage = classifyDropOff(l);
                      return (
                        <tr key={l.phone} className="hover:bg-muted/30">
                          <td className="px-4 py-2 font-mono text-xs">
                            {maskPhoneForDisplay(l.phone)}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {fmtDate(l.startedAt)}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {fmtDate(l.otpVerifiedAt)}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {fmtDate(l.ninAttemptedAt)}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                stage === "completed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : stage === "after-nin-attempt"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-red-100 text-red-800"
                              }`}
                            >
                              {dropOffLabel(stage)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {l.resolvedEnrolleeIds?.length ?? 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Phone numbers are partially masked. To get the full number for an
          intervention call, hit the audit log with the phone hash on the
          server side. Reach out to engineering if you need this surfaced
          inline.
        </p>

        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
