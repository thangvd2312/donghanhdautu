-- CreateTable
CREATE TABLE "SavedScreen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "sort" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedScreen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedScreen_userId_updatedAt_idx" ON "SavedScreen"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedScreen_userId_name_key" ON "SavedScreen"("userId", "name");

-- AddForeignKey
ALTER TABLE "SavedScreen" ADD CONSTRAINT "SavedScreen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
