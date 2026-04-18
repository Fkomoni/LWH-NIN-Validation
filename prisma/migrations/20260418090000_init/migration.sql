-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Relationship" AS ENUM ('PRINCIPAL', 'SPOUSE', 'CHILD', 'PARENT', 'OTHER');

-- CreateEnum
CREATE TYPE "NinStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'VALIDATING', 'VALIDATED', 'FAILED', 'UPDATED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AuthAttemptChannel" AS ENUM ('DOB', 'PRINCIPAL_NIN', 'OTP');

-- CreateEnum
CREATE TYPE "AuthAttemptOutcome" AS ENUM ('SUCCESS', 'FAIL', 'LOCKED');

-- CreateEnum
CREATE TYPE "NinOutcome" AS ENUM ('PASS_AUTO', 'REVIEW_SOFT', 'FAIL_HARD', 'PROVIDER_ERROR', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "ManualReviewStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('READ_ONLY', 'OPS', 'ADMIN');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "enrolleeId" TEXT NOT NULL,
    "principalId" TEXT,
    "fullName" TEXT NOT NULL,
    "relationship" "Relationship" NOT NULL,
    "dobEncrypted" BYTEA NOT NULL,
    "dobHash" TEXT NOT NULL,
    "phoneEncrypted" BYTEA,
    "phoneHash" TEXT,
    "emailEncrypted" BYTEA,
    "ninEncrypted" BYTEA,
    "ninHash" TEXT,
    "ninStatus" "NinStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "ninValidatedAt" TIMESTAMP(3),
    "ninValidatedName" TEXT,
    "ninDobEncrypted" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "enrolleeId" TEXT NOT NULL,
    "channel" "AuthAttemptChannel" NOT NULL,
    "outcome" "AuthAttemptOutcome" NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lockout" (
    "enrolleeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notifiedOps" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Lockout_pkey" PRIMARY KEY ("enrolleeId")
);

-- CreateTable
CREATE TABLE "OtpIssuance" (
    "id" TEXT NOT NULL,
    "enrolleeId" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resentCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "OtpIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NinValidationAttempt" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "submittedByEnr" TEXT NOT NULL,
    "ninHash" TEXT NOT NULL,
    "nameScore" DOUBLE PRECISION,
    "dobMatched" BOOLEAN,
    "outcome" "NinOutcome" NOT NULL,
    "rawResponseRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NinValidationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrognosisWrite" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "txnRef" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrognosisWrite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualReview" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ManualReviewStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'READ_ONLY',
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traceId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "memberId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "payload" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KvEntry" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KvEntry_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "KvWindowSample" (
    "key" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nonce" TEXT NOT NULL,

    CONSTRAINT "KvWindowSample_pkey" PRIMARY KEY ("key","sampledAt","nonce")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_enrolleeId_key" ON "Member"("enrolleeId");

-- CreateIndex
CREATE UNIQUE INDEX "member_dobHash_idx" ON "Member"("dobHash");

-- CreateIndex
CREATE UNIQUE INDEX "member_phoneHash_idx" ON "Member"("phoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "member_ninHash_idx" ON "Member"("ninHash");

-- CreateIndex
CREATE INDEX "Member_principalId_idx" ON "Member"("principalId");

-- CreateIndex
CREATE INDEX "Member_ninStatus_idx" ON "Member"("ninStatus");

-- CreateIndex
CREATE INDEX "AuthAttempt_enrolleeId_createdAt_idx" ON "AuthAttempt"("enrolleeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_ip_createdAt_idx" ON "AuthAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "Lockout_expiresAt_idx" ON "Lockout"("expiresAt");

-- CreateIndex
CREATE INDEX "OtpIssuance_enrolleeId_createdAt_idx" ON "OtpIssuance"("enrolleeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "nin_idem_idx" ON "NinValidationAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NinValidationAttempt_memberId_createdAt_idx" ON "NinValidationAttempt"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrognosisWrite_txnRef_key" ON "PrognosisWrite"("txnRef");

-- CreateIndex
CREATE INDEX "PrognosisWrite_memberId_createdAt_idx" ON "PrognosisWrite"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "PrognosisWrite_status_idx" ON "PrognosisWrite"("status");

-- CreateIndex
CREATE INDEX "ManualReview_status_createdAt_idx" ON "ManualReview"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "AuditEvent_traceId_idx" ON "AuditEvent"("traceId");

-- CreateIndex
CREATE INDEX "AuditEvent_memberId_at_idx" ON "AuditEvent"("memberId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_action_at_idx" ON "AuditEvent"("action", "at");

-- CreateIndex
CREATE INDEX "KvEntry_expiresAt_idx" ON "KvEntry"("expiresAt");

-- CreateIndex
CREATE INDEX "KvWindowSample_key_sampledAt_idx" ON "KvWindowSample"("key", "sampledAt");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NinValidationAttempt" ADD CONSTRAINT "NinValidationAttempt_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrognosisWrite" ADD CONSTRAINT "PrognosisWrite_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

