-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importBatchId" TEXT;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceDaily" (
    "assetType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceDaily_pkey" PRIMARY KEY ("assetType","symbol","date")
);

-- CreateIndex
CREATE INDEX "ImportBatch_userId_hash_idx" ON "ImportBatch"("userId", "hash");

-- CreateIndex
CREATE INDEX "Transaction_importBatchId_idx" ON "Transaction"("importBatchId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
