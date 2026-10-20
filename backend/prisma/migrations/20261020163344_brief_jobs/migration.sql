-- CreateTable
CREATE TABLE "BriefJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 4,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BriefJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BriefJob_status_runAfter_idx" ON "BriefJob"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "BriefJob_userId_kind_day_key" ON "BriefJob"("userId", "kind", "day");
