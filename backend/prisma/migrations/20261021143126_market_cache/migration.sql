-- CreateTable
CREATE TABLE "MarketCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "staleUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "MarketCache_staleUntil_idx" ON "MarketCache"("staleUntil");
