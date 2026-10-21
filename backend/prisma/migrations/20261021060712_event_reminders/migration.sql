-- CreateTable
CREATE TABLE "EventReminderSetting" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "daysBefore" INTEGER NOT NULL DEFAULT 1,
    "mutedSymbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReminderSetting_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "EventReminderSetting" ADD CONSTRAINT "EventReminderSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
