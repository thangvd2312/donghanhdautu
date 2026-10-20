-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "portfolioId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "portfolioId" TEXT;

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_idx" ON "Transaction"("portfolioId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mỗi người đã có dữ liệu được tạo "Danh mục chính" và mọi giao dịch hiện có thuộc về danh mục đó
INSERT INTO "Portfolio" ("id", "userId", "name", "isDefault", "createdAt")
SELECT 'pf_' || u."id", u."id", 'Danh mục chính', true, CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Transaction" t WHERE t."userId" = u."id")
   OR EXISTS (SELECT 1 FROM "Holding" h WHERE h."userId" = u."id");

UPDATE "Transaction" t SET "portfolioId" = 'pf_' || t."userId" WHERE t."portfolioId" IS NULL;
UPDATE "ImportBatch" b SET "portfolioId" = 'pf_' || b."userId" WHERE b."portfolioId" IS NULL;
