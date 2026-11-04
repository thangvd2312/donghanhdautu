-- Mục tiêu v3 đợt A (docs/DESIGN_GOALS_V3.md §14): mẫu, ưu tiên, quỹ dự phòng, dòng tiền, gắn giao dịch vào mục tiêu

-- 1. Cột mới của Goal
ALTER TABLE "Goal" ADD COLUMN "template" TEXT;
ALTER TABLE "Goal" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Goal" ADD COLUMN "monthlyContributionMax" DOUBLE PRECISION;
ALTER TABLE "Goal" ADD COLUMN "contributionDay" INTEGER;
ALTER TABLE "Goal" ADD COLUMN "startedAt" DATE;
ALTER TABLE "Goal" ADD COLUMN "monthlyExpense" DOUBLE PRECISION;
ALTER TABLE "Goal" ADD COLUMN "safetyMonths" INTEGER;
-- Mốc lộ trình của mục tiêu cũ = ngày tạo (theo lịch VN)
UPDATE "Goal" SET "startedAt" = (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
ALTER TABLE "Goal" ALTER COLUMN "startedAt" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "startedAt" SET DEFAULT CURRENT_TIMESTAMP;
-- Mục tiêu cũ: kiểu return ưu tiên 4 (mặc định), kiểu amount ưu tiên 3 (hạn mềm, chưa biết mẫu)
UPDATE "Goal" SET "priority" = 3 WHERE "kind" = 'amount';

-- 2. Giao dịch gắn mục tiêu, kế hoạch giải ngân gắn mục tiêu + góp mỗi tháng
ALTER TABLE "Transaction" ADD COLUMN "goalId" TEXT;
ALTER TABLE "DeploymentPlan" ADD COLUMN "goalId" TEXT;
ALTER TABLE "DeploymentPlan" ADD COLUMN "monthlyAmount" DOUBLE PRECISION;

-- 3. Bảng tháng góp tiền
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "split" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoalContribution_userId_month_key" ON "GoalContribution"("userId", "month");
CREATE INDEX "Transaction_userId_goalId_idx" ON "Transaction"("userId", "goalId");
CREATE INDEX "DeploymentPlan_goalId_idx" ON "DeploymentPlan"("goalId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeploymentPlan" ADD CONSTRAINT "DeploymentPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Chuyển phần gán % cũ sang giao dịch: mỗi mã (của mỗi người dùng) gắn vào mục tiêu có % lớn nhất,
--    chỉ với giao dịch còn hiệu lực chưa gắn mục tiêu nào. Tiền mặt: mọi giao dịch tiền (số dư đầu kỳ cash,
--    nạp, rút, phí, cổ tức không mã), cả VND lẫn USDT.
UPDATE "Transaction" t
SET "goalId" = pick."goalId"
FROM (
    SELECT DISTINCT ON (g."userId", a."assetType", CASE WHEN a."assetType" = 'cash' THEN '' ELSE upper(btrim(a."symbol")) END)
        g."userId" AS "userId",
        a."assetType" AS "assetType",
        CASE WHEN a."assetType" = 'cash' THEN '' ELSE upper(btrim(a."symbol")) END AS "symbol",
        a."goalId" AS "goalId"
    FROM "GoalAllocation" a
    JOIN "Goal" g ON g."id" = a."goalId"
    WHERE a."pct" > 0
    ORDER BY g."userId", a."assetType", CASE WHEN a."assetType" = 'cash' THEN '' ELSE upper(btrim(a."symbol")) END,
             a."pct" DESC, g."createdAt" ASC, g."id" ASC
) pick
WHERE t."userId" = pick."userId"
  AND t."goalId" IS NULL
  AND t."deletedAt" IS NULL
  AND (
    (pick."assetType" = 'cash' AND (t."assetType" IS NULL OR t."assetType" = 'cash'))
    OR (pick."assetType" <> 'cash' AND t."assetType" = pick."assetType" AND upper(btrim(t."symbol")) = pick."symbol")
  );

-- 5. Bỏ phần cũ: gán % tài sản, tỷ trọng mong muốn, lợi suất tự nhập
DROP TABLE "GoalAllocation";
ALTER TABLE "Goal" DROP COLUMN "targetAllocation";
ALTER TABLE "Goal" DROP COLUMN "expectedReturnPct";
