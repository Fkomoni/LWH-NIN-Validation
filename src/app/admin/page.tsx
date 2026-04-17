import { PageShell } from "@/components/layout/PageShell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const metadata = { title: "Admin — Leadway Health" };

/**
 * Admin console landing — Phase 4 destination. Real role-gating + search +
 * manual-review queue + unlock + CSV export land in Phase 4. This page
 * exists today so the routing and layout are ready.
 */
export default function AdminLandingPage() {
  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Internal tools
          </p>
          <h1 className="text-2xl font-bold">Ops console</h1>
          <p className="text-sm text-muted-foreground">
            Search enrollees, triage manual reviews, unlock accounts, export reports.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Manual review queue</CardTitle>
              <CardDescription>
                NIN submissions with a 0.80–0.92 name score land here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Lands in Phase 4. The schema for this table (model
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">ManualReview</code>)
                is already in <code>prisma/schema.prisma</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lockout register</CardTitle>
              <CardDescription>48-hour locks triggered by abuse rules.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Phase 4 adds search + single-click unlock for ops. Schema:
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">Lockout</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
              <CardDescription>Append-only, 12-month retention.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Every sensitive action already emits a structured event today via
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">src/server/audit.ts</code>
                with a <code>traceId</code> joining client + server.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>CSV/XLSX for ops reporting.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Phase 4. Confirm the required column list with the client first.
              </p>
            </CardContent>
          </Card>
        </div>

        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          This page is a Phase 4 placeholder. Role-gating via NextAuth v5 arrives
          in Phase 2 so this route is not protected yet.
        </p>
      </div>
    </PageShell>
  );
}
