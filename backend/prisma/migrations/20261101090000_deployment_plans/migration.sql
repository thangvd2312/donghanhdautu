-- CreateTable
CREATE TABLE "DeploymentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "mode" TEXT NOT NULL,
    "horizon" TEXT NOT NULL,
    "needBy" DATE,
    "inputs" JSONB NOT NULL,
    "targetMix" JSONB NOT NULL,
    "suggestedMix" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "rationale" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nextReviewAt" DATE NOT NULL,
    "remindedReviewFor" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "assetType" TEXT,
    "symbol" TEXT,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "tranche" INTEGER NOT NULL,
    "tranches" INTEGER NOT NULL,
    "price" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "hint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "skipReason" TEXT,
    "transactionId" TEXT,
    "doneAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "DeploymentStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentPlan_userId_status_idx" ON "DeploymentPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "DeploymentPlan_status_nextReviewAt_idx" ON "DeploymentPlan"("status", "nextReviewAt");

-- CreateIndex
CREATE INDEX "DeploymentStep_planId_idx" ON "DeploymentStep"("planId");

-- CreateIndex
CREATE INDEX "DeploymentStep_status_dueDate_idx" ON "DeploymentStep"("status", "dueDate");

-- AddForeignKey
ALTER TABLE "DeploymentPlan" ADD CONSTRAINT "DeploymentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentStep" ADD CONSTRAINT "DeploymentStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DeploymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

