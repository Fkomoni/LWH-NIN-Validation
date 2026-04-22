import type { NotificationService } from "../types";

/**
 * Mock notifications — console.log only. All PII is already assumed to be
 * masked by the caller before `vars` is built.
 */
export const mockNotificationService: NotificationService = {
  async send({ kind, to, vars }) {
    // eslint-disable-next-line no-console
    console.log("[mock.notify]", kind, { to, vars });
    return { ok: true };
  },
};
