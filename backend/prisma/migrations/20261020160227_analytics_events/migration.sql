-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT,
    "actor" TEXT NOT NULL,
    "sample" BOOLEAN NOT NULL DEFAULT false,
    "props" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_actor_dedupeKey_key" ON "AnalyticsEvent"("actor", "dedupeKey");

-- CreateIndex
CREATE INDEX "BriefRun_conversationId_idx" ON "BriefRun"("conversationId");
