-- Gỡ các tính năng không dùng: Kế hoạch mã, Mục tiêu, Kế hoạch giải ngân, Soi lời khuyên, Luyện tập (tiền ảo).
-- Tái cân bằng và Thử kịch bản không có bảng riêng.

-- 1. Thông báo của các loại đã gỡ (nhắc xem lại kế hoạch, chấm lại lời khuyên, đợt giải ngân); lượt gửi Telegram /
--    Web Push của chúng bị xoá theo (ON DELETE CASCADE)
DELETE FROM "Notification" WHERE "kind" IN ('plan_review', 'tip_review', 'deployment');

-- 2. Bỏ khoá của các loại tin đã gỡ khỏi cài đặt Telegram / Web Push
UPDATE "TelegramLink" SET "kinds" = "kinds" - 'plan_review' - 'tip_review' - 'deployment'
WHERE jsonb_typeof("kinds") = 'object';
UPDATE "PushSettings" SET "kinds" = "kinds" - 'plan_review' - 'tip_review' - 'deployment'
WHERE jsonb_typeof("kinds") = 'object';

-- 3. Bảng và cột của các tính năng đã gỡ

-- DropForeignKey
ALTER TABLE "DeploymentPlan" DROP CONSTRAINT "DeploymentPlan_goalId_fkey";

-- DropForeignKey
ALTER TABLE "DeploymentPlan" DROP CONSTRAINT "DeploymentPlan_userId_fkey";

-- DropForeignKey
ALTER TABLE "DeploymentStep" DROP CONSTRAINT "DeploymentStep_planId_fkey";

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_userId_fkey";

-- DropForeignKey
ALTER TABLE "GoalContribution" DROP CONSTRAINT "GoalContribution_userId_fkey";

-- DropForeignKey
ALTER TABLE "InvestmentPlan" DROP CONSTRAINT "InvestmentPlan_userId_fkey";

-- DropForeignKey
ALTER TABLE "PaperAccount" DROP CONSTRAINT "PaperAccount_userId_fkey";

-- DropForeignKey
ALTER TABLE "PaperTrade" DROP CONSTRAINT "PaperTrade_accountId_fkey";

-- DropForeignKey
ALTER TABLE "PlanReview" DROP CONSTRAINT "PlanReview_planId_fkey";

-- DropForeignKey
ALTER TABLE "PlanVersion" DROP CONSTRAINT "PlanVersion_planId_fkey";

-- DropForeignKey
ALTER TABLE "TipCheck" DROP CONSTRAINT "TipCheck_userId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_goalId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_planId_fkey";

-- DropIndex
DROP INDEX "Transaction_planId_idx";

-- DropIndex
DROP INDEX "Transaction_userId_goalId_idx";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "goalId",
DROP COLUMN "planId";

-- DropTable
DROP TABLE "DeploymentPlan";

-- DropTable
DROP TABLE "DeploymentStep";

-- DropTable
DROP TABLE "Goal";

-- DropTable
DROP TABLE "GoalContribution";

-- DropTable
DROP TABLE "InvestmentPlan";

-- DropTable
DROP TABLE "PaperAccount";

-- DropTable
DROP TABLE "PaperTrade";

-- DropTable
DROP TABLE "PlanReview";

-- DropTable
DROP TABLE "PlanVersion";

-- DropTable
DROP TABLE "TipCheck";
