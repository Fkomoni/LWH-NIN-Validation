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
import { getAllowlist } from "@/server/admin/allowlist";
import { AddAdminForm } from "./AddAdminForm";
import { RemoveAdminButton } from "./RemoveAdminButton";

export const metadata = { title: "Manage admins — Leadway Health" };

export default async function AdminsPage() {
  const me = await getAdminSession();
  if (!me) redirect("/admin/login");

  const list = await getAllowlist();

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Internal tools
          </p>
          <h1 className="text-2xl font-bold">Manage admins</h1>
          <p className="text-sm text-muted-foreground">
            Anyone listed here can sign in at <code>/admin/login</code> with the
            shared admin password. While the list is empty, any email works
            (bootstrap mode) — add at least one entry to enforce the
            allowlist.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add an admin</CardTitle>
            <CardDescription>
              Send the new admin the same password you used to sign in. They
              should change the bootstrap password as soon as practical.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddAdminForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Current allowlist {list.length > 0 ? `(${list.length})` : ""}
            </CardTitle>
            <CardDescription>
              {list.length === 0
                ? "No emails on the allowlist yet. Bootstrap mode is active."
                : "Only these emails can sign in to the admin console."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add the first admin above to enforce the allowlist.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {list.map((email) => (
                  <li
                    key={email}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{email}</p>
                      {email === me.email ? (
                        <p className="text-xs text-muted-foreground">You</p>
                      ) : null}
                    </div>
                    {list.length > 1 ? <RemoveAdminButton email={email} /> : null}
                  </li>
                ))}
              </ul>
            )}
            {list.length === 1 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                The last admin can&apos;t be removed. Add a second admin first.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
