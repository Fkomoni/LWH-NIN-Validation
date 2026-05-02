import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { getAdminSession } from "@/server/admin/session";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata = { title: "Admin sign in — Leadway Health" };

export default async function AdminLoginPage() {
  const s = await getAdminSession();
  if (s) redirect("/admin/reviews");

  return (
    <PageShell>
      <div className="mx-auto max-w-md space-y-4">
        {/* Visible dev-only notice — kept loud on purpose so a stray
            production viewer sees the scope and doesn't mistake this
            for the final access model. */}
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-semibold text-destructive">
              Development access only — MVP
            </p>
            <p className="mt-1 text-foreground">
              This login uses a single shared bootstrap password, and is
              intended for internal testing during the review build. Real
              per-admin auth (Leadway SSO / email + hashed password) lands
              in Phase 2 before any production enrolment of ops users.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ops console sign in</CardTitle>
            <CardDescription>
              Any email; the shared password is provisioned via the
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                ADMIN_BOOTSTRAP_PASSWORD
              </code>
              environment variable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminLoginForm />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
