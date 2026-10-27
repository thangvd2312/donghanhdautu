-- Kho tin cho tìm kiếm: bảng mới, không đụng dữ liệu cũ. searchVector do app ghi (tiêu đề + mã trọng số A, tóm tắt B, đã bỏ dấu).

-- CreateTable
CREATE TABLE "NewsArticle" (
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "tickers" TEXT[],
    "importance" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3),

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsArticle_kind_publishedAt_idx" ON "NewsArticle"("kind", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsArticle_searchVector_idx" ON "NewsArticle" USING GIN ("searchVector");

