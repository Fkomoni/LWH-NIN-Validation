import "server-only";
import { getKv } from "@/server/kv";

/**
 * Manual review queue — in-memory (via KV) for Phase 1. Phase 4 moves
 * this to Postgres using the `ManualReview` model already in
 * prisma/schema.prisma. Public shape is the same so the UI is final.
 */

export type ReviewStatus = "OPEN" | "APPROVED" | "REJECTED";

export interface Review {
  id: string;
  enrolleeId: string;
  memberId: string;
  memberName: string;
  nameScore: number;
  verifiedFullName?: string;
  reason: string;
  status: ReviewStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedById?: string;
}

const KEY = "admin:reviews";

export async function listReviews(status?: ReviewStatus): Promise<Review[]> {
  const all = (await getKv().get<Review[]>(KEY)) ?? [];
  return status ? all.filter((r) => r.status === status) : all;
}

export async function enqueueReview(r: Omit<Review, "id" | "createdAt" | "status">): Promise<void> {
  const all = (await getKv().get<Review[]>(KEY)) ?? [];
  all.unshift({
    ...r,
    id: `rv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: "OPEN",
  });
  await getKv().set(KEY, all);
}

export async function resolveReview(
  id: string,
  status: "APPROVED" | "REJECTED",
  adminId: string,
): Promise<Review | null> {
  const all = (await getKv().get<Review[]>(KEY)) ?? [];
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0 || !all[idx]) return null;
  all[idx] = {
    ...all[idx],
    status,
    resolvedAt: new Date().toISOString(),
    resolvedById: adminId,
  };
  await getKv().set(KEY, all);
  return all[idx];
}
