import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { getAdminSession } from "@/server/admin/session";
import { listReviews } from "@/server/admin/reviews";
import { adminLogout } from "@/server/actions/admin";
import { ReviewActions } from "./ReviewActions";

export const metadata = { title: "Manual review — Leadway Health" };

export default async function ReviewsPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const open = await listReviews("OPEN");
  const resolved = (await listReviews()).filter((r) => r.status !== "OPEN").slice(0, 20);

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Ops console</p>
            <h1 className="text-2xl font-bold">Manual review queue</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-mono">{admin.email}</span> ({admin.role}).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/unlock">Reset member</Link>
            </Button>
            <form action={adminLogout}>
              <Button type="submit" variant="outline">Sign out</Button>
            </form>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Open ({open.length})
          </h2>
          {open.length === 0 ? (
            <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Nothing waiting. Manual reviews appear here when a NIN returns a
              name score between 0.80 and 0.92.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {open.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {r.memberName}{" "}
                      <span className="text-xs text-muted-foreground">· {r.enrolleeId}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      NIMC says: <span className="font-medium">{r.verifiedFullName ?? "—"}</span>
                      {" · "}score {r.nameScore.toFixed(2)}
                      {" · "}
                      {new Date(r.createdAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}
                    </p>
                  </div>
                  <ReviewActions id={r.id} adminId={admin.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {resolved.length > 0 ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Recently resolved</h2>
            <ul className="divide-y rounded-lg border bg-muted/20">
              {resolved.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span>
                    {r.memberName} · {r.enrolleeId}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
