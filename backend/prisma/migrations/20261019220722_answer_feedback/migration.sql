-- CreateTable
CREATE TABLE "AnswerFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnswerFeedback_status_createdAt_idx" ON "AnswerFeedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerFeedback_userId_answerId_key" ON "AnswerFeedback"("userId", "answerId");

-- AddForeignKey
ALTER TABLE "AnswerFeedback" ADD CONSTRAINT "AnswerFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

