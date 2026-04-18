"use client";

import { useEffect, useState } from "react";

/**
 * "Xh Ym" style countdown to `expiresAt` (ms-epoch). Re-renders every
 * minute. Returns "any moment now" once we're within a minute, and
 * "expired" when past — the page reload will clear the lock server-side.
 */
function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "any moment now";
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours >= 1) {
    return `${hours}h ${remMin.toString().padStart(2, "0")}m`;
  }
  return `${remMin}m`;
}

export function LockoutCountdown({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const tick = () => setRemaining(expiresAt - Date.now());
    tick();
    const id = setInterval(tick, 60_000); // once a minute is plenty
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span className="font-mono font-semibold tabular-nums">
      {formatRemaining(remaining)}
    </span>
  );
}
