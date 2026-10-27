-- Danh sách cố vấn tách bản tin tự động khỏi các câu người dùng tự hỏi: lưu loại bản tin + câu tóm tắt trên cuộc trò chuyện.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "brief" TEXT,
ADD COLUMN "headline" TEXT;

-- Bản tin đã có BriefRun: loại lấy từ key (brief:<kind>:…), câu tóm tắt lấy từ tiêu đề thông báo ("<tiêu đề>: <tóm tắt>")
UPDATE "Conversation" c
SET "brief" = split_part(r."key", ':', 2),
    "headline" = CASE
      WHEN position(': ' IN r."notification"->>'title') > 0
      THEN NULLIF(substring(r."notification"->>'title' FROM position(': ' IN r."notification"->>'title') + 2), '')
    END
FROM "BriefRun" r
WHERE r."conversationId" = c."id";

-- Bản tin gửi trước khi có BriefRun: nhận theo tiêu đề
UPDATE "Conversation" SET "brief" = 'morning' WHERE "brief" IS NULL AND "title" ~ '^Bản tin sáng \d{2}/\d{2}$';
UPDATE "Conversation" SET "brief" = 'closing' WHERE "brief" IS NULL AND "title" ~ '^Tổng kết phiên \d{2}/\d{2}$';
UPDATE "Conversation" SET "brief" = 'weekly' WHERE "brief" IS NULL AND "title" ~ '^Tổng kết tuần \d{2}/\d{2}$';
UPDATE "Conversation" SET "brief" = 'crypto' WHERE "brief" IS NULL AND "title" ~ '^Bản tin coin \d{2}:\d{2} \d{2}/\d{2}$';
