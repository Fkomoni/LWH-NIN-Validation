import { randomUUID, randomBytes } from "node:crypto";

export function traceId(): string {
  return randomUUID();
}

export function idempotencyKey(): string {
  return randomUUID();
}

export function txnRef(): string {
  // Short-ish, URL-safe. Suitable as an opaque id to downstreams.
  return `lwh_${randomBytes(9).toString("base64url")}`;
}

export function supportRef(): string {
  return `LWH-${randomBytes(4).toString("hex").toUpperCase()}`;
}
