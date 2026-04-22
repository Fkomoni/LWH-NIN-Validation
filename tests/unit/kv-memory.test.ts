import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMemoryKv } from "@/server/kv/memory";

describe("MemoryKv", () => {
  let kv = getMemoryKv();

  beforeEach(() => {
    kv = getMemoryKv();
    vi.useRealTimers();
  });

  it("round-trips a value", async () => {
    await kv.set("k", { a: 1 });
    expect(await kv.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("honours TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await kv.set("ttl", "v", { ttlMs: 1000 });
    expect(await kv.get("ttl")).toBe("v");
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(await kv.get("ttl")).toBe(null);
  });

  it("pushWindow counts events inside the window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(await kv.pushWindow("w1", 60_000)).toBe(1);
    expect(await kv.pushWindow("w1", 60_000)).toBe(2);
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z")); // 2 min later
    expect(await kv.pushWindow("w1", 60_000)).toBe(1); // prior entries aged out
  });

  it("incr increments a counter and persists TTL", async () => {
    const k = "counter";
    expect(await kv.incr(k, { ttlMs: 500 })).toBe(1);
    expect(await kv.incr(k)).toBe(2);
    expect(await kv.incr(k)).toBe(3);
  });

  it("del removes the key", async () => {
    await kv.set("del", 1);
    await kv.del("del");
    expect(await kv.exists("del")).toBe(false);
  });
});
