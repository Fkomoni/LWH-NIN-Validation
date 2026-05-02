import "server-only";
import { getKv } from "@/server/kv";

/**
 * Persistent allowlist of admin emails.
 *
 * Bootstrap behaviour: when the list is empty, ANY email + the bootstrap
 * password is accepted (so the very first admin can log in and set
 * themselves up). Once at least one email is on the list, only those
 * emails are accepted.
 *
 * Stored as a single JSON array in Upstash so the list survives
 * restarts. Volume is tiny (handful of admins) — no need for a Redis
 * set.
 */

const KEY = "admin:allowlist";

export async function getAllowlist(): Promise<string[]> {
  const list = await getKv().get<string[]>(KEY);
  return list ?? [];
}

export async function addAdmin(email: string): Promise<string[]> {
  const e = email.trim().toLowerCase();
  const list = await getAllowlist();
  if (!list.includes(e)) list.push(e);
  list.sort();
  await getKv().set(KEY, list);
  return list;
}

export async function removeAdmin(email: string): Promise<string[]> {
  const e = email.trim().toLowerCase();
  const list = await getAllowlist();
  const next = list.filter((x) => x !== e);
  await getKv().set(KEY, next);
  return next;
}

/**
 * Returns true when:
 *   - the allowlist is empty (bootstrap mode), or
 *   - the email appears on the allowlist (case-insensitive).
 */
export async function isAdminAllowed(email: string): Promise<boolean> {
  const list = await getAllowlist();
  if (list.length === 0) return true;
  return list.includes(email.trim().toLowerCase());
}
