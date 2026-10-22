-- FREE-08 Nhật ký quyết định: nhãn lý do / cảm xúc (tuỳ chọn) trên giao dịch và lần xem lại kế hoạch; giao dịch gắn kế hoạch.
-- Chỉ thêm cột cho phép null: dữ liệu cũ giữ nguyên, không cần backfill.

-- AlterTable
ALTER TABLE "PlanReview" ADD COLUMN     "emotion" TEXT,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "emotion" TEXT,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_planId_idx" ON "Transaction"("planId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InvestmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
