import { appConfig } from "@/config/app";
import { Phone, Mail, Clock } from "lucide-react";

/** Always-visible support panel on failure screens per brief. */
export function SupportBlock() {
  const c = appConfig.contact;
  return (
    <aside
      aria-labelledby="support-heading"
      className="rounded-lg border bg-muted/50 p-4 text-sm"
    >
      <h2 id="support-heading" className="mb-2 font-semibold text-foreground">
        Need help?
      </h2>
      <p className="mb-3 text-muted-foreground">
        Our support team can help if something isn't working. Please have your
        Enrollee ID handy.
      </p>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" aria-hidden />
          <a href={`tel:${c.supportPhone.replace(/\s|-/g, "")}`} className="underline-offset-2 hover:underline">
            {c.supportPhone}
          </a>
        </li>
        <li className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" aria-hidden />
          <a href={`mailto:${c.supportEmail}`} className="underline-offset-2 hover:underline">
            {c.supportEmail}
          </a>
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden />
          <span>{c.supportHours}</span>
        </li>
      </ul>
    </aside>
  );
}
