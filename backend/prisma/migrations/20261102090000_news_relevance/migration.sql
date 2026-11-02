-- AI lọc tin: chỉ tin có ảnh hưởng tới đầu tư mới được đưa vào app. Tin cũ để null (chưa chấm): worker chấm bù.
ALTER TABLE "NewsTag" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'stock';
ALTER TABLE "NewsTag" ADD COLUMN "relevant" BOOLEAN;
