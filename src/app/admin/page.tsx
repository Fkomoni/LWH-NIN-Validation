import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/server/admin/session";
import { adminLogout } from "@/server/actions/admin";
import { getPortalStats } from "@/server/stats";
import { getFunnelStats } from "@/server/leads";

export const metadata = { title: "Admin — Leadway Health" };

/**
 * Admin landing — live stats + links to the other ops tools.
 * Gated by the admin session cookie; unauthenticated requests are
 * redirected to /admin/login.
 */
export default async function AdminLandingPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const stats = await getPortalStats();
  const funnel = await getFunnelStats();
  const dropOff = (from: number, to: number): string => {
    if (from === 0) return "—";
    const pct = Math.round(((from - to) / from) * 100);
    return `${pct}% drop-off`;
  };

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Internal tools
            </p>
            <h1 className="text-2xl font-bold">Ops console</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-mono">{admin.email}</span> ({admin.role}).
            </p>
          </div>
          <form action={adminLogout}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>NIN updates on Prognosis</CardTitle>
              <CardDescription>
                Successful writes to <code>upsertMemberNin</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-baseline gap-6">
              <div>
                <p className="text-3xl font-bold tabular-nums">{stats.ninTotal.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">All time</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{stats.ninToday.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Today (UTC)</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DOB corrections on Prognosis</CardTitle>
              <CardDescription>
                Successful writes to <code>UpdateBiodata</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-baseline gap-6">
              <div>
                <p className="text-3xl font-bold tabular-nums">{stats.dobTotal.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">All time</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{stats.dobToday.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Today (UTC)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick-update funnel</CardTitle>
            <CardDescription>
              How many members started the phone-first flow and how far they got.
              Drop-offs are candidates for a follow-up call.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {funnel.started.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Started (phone entered)</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {funnel.otpVerified.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  OTP verified · {dropOff(funnel.started, funnel.otpVerified)}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {funnel.ninAttempted.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  NIN attempted · {dropOff(funnel.otpVerified, funnel.ninAttempted)}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-emerald-700">
                  {funnel.completed.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Completed · {dropOff(funnel.ninAttempted, funnel.completed)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manual review queue</CardTitle>
              <CardDescription>
                NIN submissions with a 0.80–0.92 name score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/reviews">Open queue</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unlock a member</CardTitle>
              <CardDescription>Reset a 48-hour hard lock.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/unlock">Unlock</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit trail</CardTitle>
              <CardDescription>
                Filter <code>prognosis.upsert.ok</code> in Azure log stream.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Every counter above is also written as a structured audit event.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
