import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" aria-label="Leadway Health home">
            <Logo className="h-9 w-auto" />
          </Link>
          <nav className="text-sm text-muted-foreground">
            <Link href="/auth" className="underline-offset-2 hover:underline">
              NIN update
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        <div className="container max-w-3xl py-8">{children}</div>
      </main>
      <footer className="border-t bg-muted/40">
        <div className="container flex flex-col gap-1 py-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>&copy; {new Date().getFullYear()} Leadway Health. All rights reserved.</span>
          <span>
            For health, wealth &amp; more.
          </span>
        </div>
      </footer>
    </div>
  );
}
