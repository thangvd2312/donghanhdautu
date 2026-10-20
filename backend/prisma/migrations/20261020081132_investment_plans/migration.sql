-- CreateTable
CREATE TABLE "InvestmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "horizon" TEXT,
    "exitConditions" TEXT NOT NULL,
    "targetPrice" DOUBLE PRECISION,
    "stopPrice" DOUBLE PRECISION,
    "reviewEveryDays" INTEGER,
    "nextReviewAt" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "closedReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "remindedFor" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanReview" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "priceAtReview" DOUBLE PRECISION,
    "pnlPctAtReview" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentPlan_userId_status_idx" ON "InvestmentPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "InvestmentPlan_status_nextReviewAt_idx" ON "InvestmentPlan"("status", "nextReviewAt");

-- CreateIndex
CREATE INDEX "PlanVersion_planId_idx" ON "PlanVersion"("planId");

-- CreateIndex
CREATE INDEX "PlanReview_planId_idx" ON "PlanReview"("planId");

-- AddForeignKey
ALTER TABLE "InvestmentPlan" ADD CONSTRAINT "InvestmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanReview" ADD CONSTRAINT "PlanReview_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
