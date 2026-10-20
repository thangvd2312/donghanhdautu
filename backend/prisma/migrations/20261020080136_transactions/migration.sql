-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "assetType" TEXT,
    "symbol" TEXT,
    "quantity" DECIMAL(30,10),
    "price" DECIMAL(30,10),
    "amount" DECIMAL(30,10),
    "fee" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "tax" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "fxRate" DECIMAL(30,10),
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionRevision" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "TransactionRevision_transactionId_idx" ON "TransactionRevision"("transactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRevision" ADD CONSTRAINT "TransactionRevision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chuyển tài sản đã khai báo thành giao dịch "số dư đầu kỳ" (không bịa lịch sử mua, không trừ tiền).
-- Ngày = ngày tạo holding theo giờ VN. Bảng Holding giữ nguyên để có thể quay lại phiên bản cũ.
INSERT INTO "Transaction" ("id", "userId", "type", "date", "assetType", "symbol", "quantity", "price", "fee", "tax", "currency", "note", "source", "createdAt", "updatedAt")
SELECT
  'mig_' || h."id",
  h."userId",
  'opening',
  (h."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  h."assetType",
  h."symbol",
  h."quantity"::numeric,
  CASE WHEN h."assetType" = 'cash' THEN 1 ELSE h."avgCost"::numeric END,
  0,
  0,
  CASE WHEN h."assetType" = 'crypto' THEN 'USDT' ELSE 'VND' END,
  h."note",
  'migration',
  h."createdAt",
  CURRENT_TIMESTAMP
FROM "Holding" h
WHERE h."quantity" > 0;
