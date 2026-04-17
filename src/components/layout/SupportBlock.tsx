import { appConfig } from "@/config/app";
import { Phone, Mail } from "lucide-react";

/** Always-visible support panel on failure screens per brief. */
export function SupportBlock() {
  const c = appConfig.contact;
  // Phone string is in "N1 / N2" form; split for two discrete tel: links.
  const phones = c.supportPhone.split(/\s*\/\s*/).filter(Boolean);

  return (
    <aside
      aria-labelledby="support-heading"
      className="rounded-lg border bg-muted/50 p-4 text-sm"
    >
      <h2 id="support-heading" className="mb-2 font-semibold text-foreground">
        Need help?
      </h2>
      <p className="mb-3 text-muted-foreground">
        Our support team can help if something isn&apos;t working. Please have
        your Enrollee ID handy.
      </p>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-foreground">Email:</span>
          <a
            href={`mailto:${c.supportEmail}`}
            className="underline-offset-2 hover:underline"
          >
            {c.supportEmail}
          </a>
        </li>
        <li className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-foreground">Call Centre:</span>
          <span>
            {phones.map((p, i) => (
              <span key={p}>
                <a
                  href={`tel:${p.replace(/\s|-/g, "")}`}
                  className="underline-offset-2 hover:underline"
                >
                  {p}
                </a>
                {i < phones.length - 1 ? " / " : null}
              </span>
            ))}
          </span>
        </li>
      </ul>
    </aside>
  );
}
