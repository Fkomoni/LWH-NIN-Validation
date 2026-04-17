import "server-only";
import { getServices } from "@/services";
import type { PrognosisUpdatePayload } from "@/services/types";
import { getKv } from "./kv";
import { log } from "@/lib/logger";

/**
 * Prognosis write outbox.
 *
 * Handles the "NIMC success → Prognosis 5xx" edge case: the NIN is
 * verified (no re-verification should ever be needed) so we park the
 * payload here and retry with exponential backoff. The caller treats
 * the overall submit as successful once the item is enqueued.
 *
 * Phase 2: store in Postgres (PrognosisWrite rows with state = RETRY_SCHEDULED)
 * + a Vercel cron hitting /api/cron/outbox. Today we keep it in KV so
 * the code paths exercise correctly.
 */

interface OutboxItem {
  id: string;
  payload: PrognosisUpdatePayload;
  attempts: number;
  nextAt: number;
}

const KEY_LIST = "outbox:prognosis";
const MAX_ATTEMPTS = 6;

function backoff(attempt: number): number {
  // 1s, 5s, 30s, 2m, 10m, 1h
  const steps = [1_000, 5_000, 30_000, 120_000, 600_000, 3_600_000];
  return steps[Math.min(attempt, steps.length - 1)] ?? 3_600_000;
}

async function read(): Promise<OutboxItem[]> {
  return (await getKv().get<OutboxItem[]>(KEY_LIST)) ?? [];
}

async function write(items: OutboxItem[]): Promise<void> {
  await getKv().set(KEY_LIST, items);
}

export async function enqueuePrognosis(payload: PrognosisUpdatePayload): Promise<void> {
  const items = await read();
  items.push({
    id: payload.txnRef,
    payload,
    attempts: 0,
    nextAt: Date.now() + backoff(0),
  });
  await write(items);
  log.info({ txnRef: payload.txnRef }, "outbox.prognosis.enqueue");
}

/**
 * Drain items whose `nextAt` has elapsed. Wire to a cron in Phase 2.
 * Returns the count processed (for test / admin visibility).
 */
export async function drainPrognosisOutbox(): Promise<{ processed: number; remaining: number }> {
  const now = Date.now();
  const items = await read();
  const remaining: OutboxItem[] = [];
  let processed = 0;

  for (const it of items) {
    if (it.nextAt > now) {
      remaining.push(it);
      continue;
    }
    const res = await getServices().prognosis.upsertMemberNin(it.payload);
    if (res.ok) {
      processed++;
      continue;
    }
    const attempts = it.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      log.error({ txnRef: it.id, attempts }, "outbox.prognosis.exhausted");
      // Dead-letter — in Phase 2 we alert ops + write to a DLQ table.
      continue;
    }
    remaining.push({ ...it, attempts, nextAt: now + backoff(attempts) });
  }

  await write(remaining);
  return { processed, remaining: remaining.length };
}
