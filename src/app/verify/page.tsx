import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { Stepper } from "@/components/brand/Stepper";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { VerifyChooser } from "./VerifyChooser";

export const metadata = { title: "Choose a way to verify — Leadway Health" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ enrolleeId?: string }>;
}) {
  const { enrolleeId } = await searchParams;
  if (!enrolleeId) {
    return (
      <PageShell>
        <p>
          Missing Enrollee ID. <Link href="/auth" className="underline">Start over</Link>.
        </p>
      </PageShell>
    );
  }
  return (
    <PageShell>
      <div className="space-y-6">
        <Stepper current="authenticate" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Let's try another way</h1>
          <p className="text-sm text-muted-foreground">
            Choose how you'd like to verify yourself for{" "}
            <span className="font-mono">{enrolleeId}</span>.
          </p>
        </div>
        <VerifyChooser enrolleeId={enrolleeId} />
        <SupportBlock />
      </div>
    </PageShell>
  );
}
