import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/server/admin/session";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata = { title: "Admin sign in — Leadway Health" };

export default async function AdminLoginPage() {
  const s = await getAdminSession();
  if (s) redirect("/admin/reviews");
  return (
    <PageShell>
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Ops console sign in</CardTitle>
            <CardDescription>
              Phase 1 dev login. Phase 2 swaps this for Leadway SSO / NextAuth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminLoginForm />
            <p className="mt-4 text-xs text-muted-foreground">
              Dev password:{" "}
              <code className="rounded bg-muted px-1 py-0.5">lwh-admin-dev</code>.
              Any email.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
