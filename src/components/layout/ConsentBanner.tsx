import { ShieldCheck } from "lucide-react";

/**
 * Consent / NHIA notice. TODO(client): replace copy with the Leadway-approved
 * wording before Phase 2 release.
 */
export function ConsentBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-md border border-brand-navy/20 bg-brand-sky/10 p-4 text-sm"
    >
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-navy" aria-hidden />
      <div>
        <p className="font-medium text-foreground">Your data is handled in line with the NDPA 2023.</p>
        <p className="mt-1 text-muted-foreground">
          We collect your National Identity Number (NIN) to comply with the NHIA
          NIN mandate and to keep your Leadway Health records accurate. We will
          never share it outside the purpose of your health cover. By
          continuing, you consent to this use.
        </p>
      </div>
    </div>
  );
}
