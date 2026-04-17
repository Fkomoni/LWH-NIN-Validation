import "server-only";
/**
 * Service resolver. One flag (`NEXT_PUBLIC_MOCKS_ENABLED`) toggles the
 * entire service container between Phase-1 mocks and the production
 * HTTP clients. No feature code branches on it.
 */
import { appConfig } from "@/config/app";
import type { ServiceContainer } from "./types";
import type { AuthSession } from "@/types/domain";

import { mockMemberService } from "./mock/MemberService.mock";
import { mockNinService } from "./mock/NinService.mock";
import { mockOtpService } from "./mock/OtpService.mock";
import { mockPrognosisService } from "./mock/PrognosisService.mock";
import { mockNotificationService } from "./mock/NotificationService.mock";

import { realMemberService } from "./real/MemberService.real";
import { realNinService } from "./real/NinService.real";
import { realOtpService } from "./real/OtpService.real";
import { realPrognosisService } from "./real/PrognosisService.real";
import { realNotificationService } from "./real/NotificationService.real";

/**
 * Phase-1 session store — per-process only. Phase 2 replaces this with
 * NextAuth v5 backed by the signed cookie or a database session.
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

let cached: ServiceContainer | null = null;

export function getServices(): ServiceContainer {
  if (cached) return cached;
  cached = appConfig.mocksEnabled
    ? {
        member: mockMemberService,
        nin: mockNinService,
        otp: mockOtpService,
        prognosis: mockPrognosisService,
        notification: mockNotificationService,
        session: sessionStore,
      }
    : {
        member: realMemberService,
        nin: realNinService,
        otp: realOtpService,
        prognosis: realPrognosisService,
        notification: realNotificationService,
        session: sessionStore,
      };
  return cached;
}
