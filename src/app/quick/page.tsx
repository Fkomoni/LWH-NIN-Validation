import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { ConsentBanner } from "@/components/layout/ConsentBanner";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { QuickStartForm } from "./QuickStartForm";

export const metadata = { title: "Update your NIN — Leadway Health" };

export default function QuickStartPage() {
  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            NIN update
          </p>
          <h1 className="text-2xl font-bold">Let&apos;s start with your phone number</h1>
          <p className="text-sm text-muted-foreground">
            Enter the phone number registered with Leadway Health and we&apos;ll send
            you a code to verify it&apos;s yours. The whole process takes about
            two minutes.
          </p>
        </div>
        <ConsentBanner />
        <QuickStartForm />
        <p className="text-xs text-muted-foreground">
          Don&apos;t have your registered phone with you?{" "}
          <Link href="/auth" className="underline">
            Use your Enrollee ID instead
          </Link>
          .
        </p>
        <SupportBlock />
      </div>
    </PageShell>
  );
}
