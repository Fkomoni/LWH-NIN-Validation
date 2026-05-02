import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/server/admin/session";
import { adminLogout } from "@/server/actions/admin";
import { getPortalStats } from "@/server/stats";
import { getFunnelStats, getDropOffSummary } from "@/server/leads";

export const metadata = { title: "Admin — Leadway Health" };

/**
 * Admin landing — live stats + links to the other ops tools.
 * Gated by the admin session cookie; unauthenticated requests are
 * redirected to /admin/login.
 */
export default async function AdminLandingPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const [stats, funnel, dropoff] = await Promise.all([
    getPortalStats(),
    getFunnelStats(),
    getDropOffSummary(),
  ]);

  const dropOff = (from: number, to: number): string => {
    if (from === 0) return "—";
    const pct = Math.round(((from - to) / from) * 100);
    return `${pct}% drop-off`;
  };
  const successRatePct = Math.round(dropoff.successRate * 100);

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

        {/* ── Top-level KPIs ─────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Unique members attempted</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {dropoff.uniqueAttempts.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Successful</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums text-emerald-700">
                {dropoff.completed.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{successRatePct}% success rate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Total NIN updates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {stats.ninTotal.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.ninToday.toLocaleString()} today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">DOB corrections</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {stats.dobTotal.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.dobToday.toLocaleString()} today
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Principal vs dependent split ───────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Principal NINs updated</CardTitle>
              <CardDescription>
                NIN saved against the policy holder.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {stats.ninPrincipalTotal.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dependant NINs updated</CardTitle>
              <CardDescription>
                NIN saved against a spouse, child or other dependant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {stats.ninDependentTotal.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Funnel / drop-off panel ────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Quick-update funnel</CardTitle>
                <CardDescription>
                  How many members reached each step. Drop-offs are candidates for
                  a follow-up call.
                </CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/leads">Open intervention list</Link>
              </Button>
            </div>
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
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
              <p className="rounded-md bg-red-50 p-2 text-red-800">
                After phone: <span className="font-bold">{dropoff.afterPhone}</span>
              </p>
              <p className="rounded-md bg-red-50 p-2 text-red-800">
                After OTP: <span className="font-bold">{dropoff.afterOtp}</span>
              </p>
              <p className="rounded-md bg-amber-50 p-2 text-amber-800">
                After NIN: <span className="font-bold">{dropoff.afterNin}</span>
              </p>
              <p className="rounded-md bg-emerald-50 p-2 text-emerald-800">
                Completed: <span className="font-bold">{dropoff.completed}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Tools ──────────────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drop-off list</CardTitle>
              <CardDescription>
                Members who didn&apos;t finish — reach out to them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/leads">Open</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manual review queue</CardTitle>
              <CardDescription>
                NIN submissions with a borderline name score.
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
              <CardTitle className="text-base">Manage admins</CardTitle>
              <CardDescription>Add or remove ops users.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/admins">Manage</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
