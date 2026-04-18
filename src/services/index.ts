import "server-only";
/**
 * Service resolver. One flag (`NEXT_PUBLIC_MOCKS_ENABLED`) toggles the
 * entire service container between Phase-1 mocks and the production
 * HTTP clients. No feature code branches on it.
 *
 * Session state is deliberately NOT on the container: the per-request
 * session lives in a signed HttpOnly cookie and is read via
 * `getSession()` / `requireSession()` in src/server/session.ts. A
 * module-level session object here would be shared across every
 * concurrent request in the process and would leak one user's identity
 * into another user's request.
 */
import { appConfig } from "@/config/app";
import type { ServiceContainer } from "./types";

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
      }
    : {
        member: realMemberService,
        nin: realNinService,
        otp: realOtpService,
        prognosis: realPrognosisService,
        notification: realNotificationService,
      };
  return cached;
}
