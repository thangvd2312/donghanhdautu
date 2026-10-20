-- CreateTable
CREATE TABLE "DismissedAction" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedAction_pkey" PRIMARY KEY ("userId","key")
);

-- AddForeignKey
ALTER TABLE "DismissedAction" ADD CONSTRAINT "DismissedAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
