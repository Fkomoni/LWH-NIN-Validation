/**
 * Service resolver. In Phase 1 every call returns a mock; Phase 2 swaps
 * these for real HTTP clients behind the same interfaces.
 */
import { appConfig } from "@/config/app";
import type { ServiceContainer } from "./types";
import type { AuthSession } from "@/types/domain";

import { mockMemberService } from "./mock/MemberService.mock";
import { mockNinService } from "./mock/NinService.mock";
import { mockOtpService } from "./mock/OtpService.mock";
import { mockPrognosisService } from "./mock/PrognosisService.mock";
import { mockNotificationService } from "./mock/NotificationService.mock";

/**
 * Phase-1 session store — per-process only (dev). Phase 2 moves to
 * NextAuth JWT / database session.
 */
let currentSession: AuthSession | null = null;
const sessionStore = {
  async currentAuth() {
    return currentSession;
  },
  async set(s: AuthSession) {
    currentSession = s;
  },
  async clear() {
    currentSession = null;
  },
};

export function getServices(): ServiceContainer {
  if (appConfig.mocksEnabled) {
    return {
      member: mockMemberService,
      nin: mockNinService,
      otp: mockOtpService,
      prognosis: mockPrognosisService,
      notification: mockNotificationService,
      session: sessionStore,
    };
  }
  // Phase 2+: real implementations. Fail fast until wired.
  throw new Error("Real services are not wired yet (Phase 2).");
}
