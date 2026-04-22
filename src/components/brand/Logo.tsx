/* eslint-disable @next/next/no-img-element */
/**
 * Leadway Health lockup.
 *
 * The supplied asset in /public/brand/leadway-logo.png is actually a JPEG
 * payload with a .png extension (see docs/brand/tokens.md §7). We serve it
 * via <img> to sidestep Next's static-image type inference and to keep the
 * ratio intact. Replace with an SVG once the client supplies the vector.
 */
export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src="/brand/leadway-logo.png" alt="Leadway Health" className={className} />;
}
