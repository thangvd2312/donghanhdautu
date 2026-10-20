-- CreateTable
CREATE TABLE "MacroFact" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "asOf" TEXT NOT NULL,
    "document" TEXT,
    "note" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "previousValue" TEXT,

    CONSTRAINT "MacroFact_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MacroFactHistory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "asOf" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacroFactHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MacroFactHistory_key_fetchedAt_idx" ON "MacroFactHistory"("key", "fetchedAt");

