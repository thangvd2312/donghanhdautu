-- AlterTable
ALTER TABLE "InvestorProfile" ADD COLUMN     "closingBrief" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "macroAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "morningBrief" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT;

-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsTag" (
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tickers" TEXT[],
    "macroScore" INTEGER NOT NULL DEFAULT 0,
    "topic" TEXT,
    "impact" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsTag_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE INDEX "PriceAlert_active_idx" ON "PriceAlert"("active");

-- CreateIndex
CREATE INDEX "PriceAlert_userId_idx" ON "PriceAlert"("userId");

-- CreateIndex
CREATE INDEX "NewsTag_publishedAt_idx" ON "NewsTag"("publishedAt");

-- AddForeignKey
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

