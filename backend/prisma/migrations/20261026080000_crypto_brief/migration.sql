-- Bản tin coin 8:00 và 20:00 mỗi ngày: tuỳ chọn bật / tắt trong hồ sơ, mặc định bật (chỉ gửi cho người đang giữ / theo dõi coin).
-- Thêm cột có giá trị mặc định, không đụng dữ liệu cũ.

-- AlterTable
ALTER TABLE "InvestorProfile" ADD COLUMN "cryptoBrief" BOOLEAN NOT NULL DEFAULT true;
