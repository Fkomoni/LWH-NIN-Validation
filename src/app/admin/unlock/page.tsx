import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/server/admin/session";
import { ResetMemberForm } from "./ResetMemberForm";

export const metadata = { title: "Reset member — Leadway Health" };

export default async function UnlockPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Ops console
          </p>
          <h1 className="text-2xl font-bold">Reset member state</h1>
          <p className="text-sm text-muted-foreground">
            Clears the 48-hour lock, the failed-attempt counter, the NIN
            validate rate limit, and any pending OTP state for one
            Enrollee ID.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Enrollee ID</CardTitle>
            <CardDescription>
              Paste the exact ID, including any <code>/</code> suffix.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetMemberForm adminEmail={admin.email} />
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground">
          <Link href="/admin/reviews" className="underline underline-offset-2">
            ← Back to manual review queue
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
