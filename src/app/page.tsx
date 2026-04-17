import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { ConsentBanner } from "@/components/layout/ConsentBanner";
import { SupportBlock } from "@/components/layout/SupportBlock";

export default function LandingPage() {
  return (
    <PageShell>
      <div className="space-y-8">
        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            NIN update
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">
            Link your NIN to your Leadway Health plan
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            As part of NHIA's updated requirements, we need the National
            Identity Number (NIN) of every member on your plan. It takes about
            two minutes, and you can do it for everyone in one go.
          </p>
          <div className="pt-2">
            <Button asChild size="lg">
              <Link href="/auth">Start NIN update</Link>
            </Button>
          </div>
        </section>

        <ConsentBanner />

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
              body: "Validate each NIN against NIMC — we'll take care of updating our records.",
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
