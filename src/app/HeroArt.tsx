"use client";
/* eslint-disable @next/next/no-img-element */
/**
 * Landing-page hero visual.
 *
 * Renders `/images/hero-family.jpg` if present in /public/images/.
 * Drop any Canva-exported JPG/PNG at that exact path and it appears
 * on the next page load. If the file is missing, the browser falls
 * back to the layered-gradient artwork underneath — which is entirely
 * brand-coloured and looks intentional.
 */
export function HeroArt() {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border shadow-md">
      {/* Branded gradient backdrop — always present. Sits behind the
          photograph so the fallback is never an empty box. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top left, hsl(var(--brand-orange) / 0.85), transparent 65%), " +
            "radial-gradient(ellipse at bottom right, hsl(var(--brand-red) / 0.85), transparent 60%), " +
            "linear-gradient(135deg, hsl(var(--brand-charcoal)), hsl(var(--brand-red) / 0.55))",
        }}
      />
      {/* Soft dotted pattern — subtle, matches the camel-sunset lockup
          without competing with it. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(hsl(0 0% 100% / 0.35) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      {/* Foreground: the photograph. When absent, the onError handler
          hides the <img> and the gradient shows through untouched. */}
      <img
        src="/images/hero-family.jpg"
        alt=""
        className="relative h-full w-full object-cover"
        loading="eager"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      {/* Overlay caption — readable on both the photo and the
          gradient fallback. */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-brand-charcoal/80 to-transparent p-5 text-primary-foreground"
      >
        <p className="text-sm font-semibold tracking-wide">For health, wealth &amp; more.</p>
        <p className="text-xs opacity-90">Healthcare you can feel.</p>
      </div>
    </div>
  );
}
