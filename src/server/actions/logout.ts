"use server";

import { redirect } from "next/navigation";
import { clearSession, getSession } from "@/server/session";
import { audit } from "@/server/audit";
import { traceId } from "@/lib/ids";

export async function logout() {
  // Read before clearing so we can attribute the audit event. Missing
  // sessions are still benign — log a best-effort entry and move on.
  const s = await getSession();
  await clearSession();
  await audit({
    action: "auth.logout",
    actorType: "portal-user",
    actorId: s?.enrolleeId,
    traceId: traceId(),
    payload: s?.sid ? { sid: s.sid, channel: s.channel } : undefined,
  });
  redirect("/");
}
