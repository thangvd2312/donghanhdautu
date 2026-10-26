-- Soi lời khuyên: bảng mới, không đụng dữ liệu cũ.

-- CreateTable
CREATE TABLE "TipCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceKind" TEXT,
    "assetType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "amountVnd" DOUBLE PRECISION,
    "priceAtCheck" DOUBLE PRECISION,
    "priceSource" TEXT,
    "benchmark" TEXT,
    "benchmarkAtCheck" DOUBLE PRECISION,
    "score" INTEGER,
    "scoreParts" JSONB,
    "personal" JSONB,
    "report" JSONB,
    "status" TEXT NOT NULL DEFAULT 'extracted',
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "boughtAt" TIMESTAMP(3),
    "planId" TEXT,
    "priceAlertId" TEXT,
    "conversationId" TEXT,
    "review30" JSONB,
    "review90" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TipCheck_userId_createdAt_idx" ON "TipCheck"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TipCheck_status_createdAt_idx" ON "TipCheck"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "TipCheck" ADD CONSTRAINT "TipCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
