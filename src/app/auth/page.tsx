import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { Stepper } from "@/components/brand/Stepper";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { ConsentBanner } from "@/components/layout/ConsentBanner";
import { AuthStartForm } from "./AuthStartForm";

export const metadata = { title: "Authenticate — Leadway Health" };

export default function AuthPage() {
  return (
    <PageShell>
      <div className="space-y-6">
        <Stepper current="authenticate" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Confirm your identity</h1>
          <p className="text-sm text-muted-foreground">
            We use your Enrollee ID and date of birth to find your plan.
          </p>
        </div>
        <ConsentBanner />
        <AuthStartForm />
        <p className="text-xs text-muted-foreground">
          Having trouble? <Link href="/" className="underline">Return home</Link>.
        </p>
        <SupportBlock />
      </div>
    </PageShell>
  );
}
