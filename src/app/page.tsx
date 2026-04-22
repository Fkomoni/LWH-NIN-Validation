import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { ConsentBanner } from "@/components/layout/ConsentBanner";
import { SupportBlock } from "@/components/layout/SupportBlock";
import { HeroArt } from "./HeroArt";

export default function LandingPage() {
  return (
    <PageShell>
      <div className="space-y-10">
        {/* ── Hero ───────────────────────────────────────────────── */}
        <section className="grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              NIN update
            </p>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              Link your NIN to your Leadway Health plan
            </h1>
            <p className="max-w-xl text-base text-muted-foreground md:text-lg">
              As part of NHIA&apos;s updated requirements, we need the National
              Identity Number (NIN) of every member on your plan. It takes
              about two minutes, and you can do it for everyone in one go.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg">
                <Link href="/auth">Start NIN update</Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                Takes about 2 minutes · secure &amp; NDPA-compliant
              </span>
            </div>
          </div>

          <HeroArt />
        </section>

        <ConsentBanner />

        {/* ── Steps ─────────────────────────────────────────────── */}
        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              n: "1",
              title: "Authenticate",
              body: "Enter your Enrollee ID and date of birth.",
            },
            {
              n: "2",
              title: "Review your household",
              body: "See yourself and your dependants in one list.",
            },
            {
              n: "3",
              title: "Submit NINs",
              body:
                "Validate each NIN against NIMC — we'll take care of updating our records.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border p-4">
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {s.n}
              </div>
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </section>

        <SupportBlock />
      </div>
    </PageShell>
  );
}
