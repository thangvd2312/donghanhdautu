-- FREE-09 Cảnh báo theo tình trạng danh mục: quy tắc tập trung / lệch tỷ trọng / giảm từ đỉnh, mỗi người một dòng mỗi loại.
-- Bảng mới, không đụng dữ liệu cũ.

-- CreateTable
CREATE TABLE "PortfolioAlertRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "thresholdPct" DOUBLE PRECISION NOT NULL,
    "windowDays" INTEGER,
    "targets" JSONB,
    "cooldownDays" INTEGER NOT NULL DEFAULT 3,
    "lastCheck" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioAlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioAlertRule_enabled_idx" ON "PortfolioAlertRule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioAlertRule_userId_kind_key" ON "PortfolioAlertRule"("userId", "kind");

-- AddForeignKey
ALTER TABLE "PortfolioAlertRule" ADD CONSTRAINT "PortfolioAlertRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
