import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { getQuickState } from "@/server/quickSession";
import { maskPhoneForDisplay } from "@/server/phoneOtp";
import { QuickOtpForm } from "./QuickOtpForm";

export const metadata = { title: "Verify code — Leadway Health" };

export default async function QuickVerifyPage() {
  const state = await getQuickState();
  if (!state) redirect("/quick");

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Step 2 of 3
          </p>
          <h1 className="text-2xl font-bold">Enter the 6-digit code</h1>
          <p className="text-sm text-muted-foreground">
            We sent a code to{" "}
            <span className="font-medium text-foreground">
              {maskPhoneForDisplay(state.phone)}
            </span>
            . It expires in 5 minutes.
          </p>
        </div>
        <QuickOtpForm otpSentAt={state.otpSentAt ?? Date.now()} />
        <SupportBlock />
      </div>
    </PageShell>
  );
}
