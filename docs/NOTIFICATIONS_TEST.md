# Kiểm tra thông báo ngoài app (NT-01)

## Tự động (CI)

[delivery.int-spec.ts](../backend/src/notifications/delivery.int-spec.ts) chạy toàn bộ đường gửi trên PostgreSQL thật. Các dịch vụ bên ngoài được thay bằng server giả, không cần kết nối mạng ra ngoài:

- **Telegram:** Bot API giả qua HTTP (`TELEGRAM_API_BASE`). Kiểm các trường hợp:
  - gửi đúng chat;
  - mặc định không lộ tiêu đề và số liệu, có link mở đúng nội dung;
  - bật "hiện chi tiết" thì có nội dung;
  - tắt loại tin sau khi đã xếp hàng thì tin đang chờ bị bỏ;
  - lỗi 5xx thì thử lại;
  - 403 (người dùng chặn bot) thì tắt liên kết;
  - nút "Gửi thử".
- **Web Push:** push service giả qua HTTPS với chứng chỉ tự ký. Payload được giải mã bằng khoá ECDH và auth secret của "trình duyệt" trong test. Kiểm các trường hợp:
  - mã hoá `aes128gcm`, có header VAPID và TTL;
  - nội dung riêng tư theo mặc định, link đúng;
  - 410 thì xoá thiết bị;
  - 503 thì thử lại.

## Thử với thiết bị thật (production)

Phần này cần chính bạn làm trên app đã deploy, vì cần tài khoản Telegram và trình duyệt/điện thoại thật.

1. **Cài đặt → Telegram:** bấm kết nối, mở bot, gửi mã. Sau đó bấm **Gửi tin thử**; tin "Tin thử từ Đồng Hành Đầu Tư" phải tới trong vài giây.
2. **Cài đặt → Thông báo trình duyệt:** bật trên điện thoại. Với iPhone, cần vào Chia sẻ → "Thêm vào MH chính" trước rồi mở app từ màn hình chính. Sau đó bấm **Gửi thử**.
3. **Đặt cảnh báo giá** gần giá hiện tại của một mã đang giao dịch, chờ chạm mốc. Kiểm tra:
   - thông báo tới cả hai kênh;
   - bấm vào mở đúng trang mã đó;
   - nếu chưa đăng nhập, sau khi đăng nhập vẫn quay về trang đó.
4. **Tắt loại tin "Giá chạm mốc"** rồi lặp lại bước 3. Không được nhận tin ngoài app; thông báo trong app vẫn có.
5. **Đặt giờ yên lặng** bao trùm giờ hiện tại rồi lặp lại bước 3. Tin được giữ lại và gửi khi hết giờ yên lặng.
6. Trạng thái từng tin (đã gửi / chờ / lỗi) xem ở mục "Gần đây" trong cài đặt của từng kênh.

Ghi kết quả từng bước vào cột "Bằng chứng" của NT-01 trong [DEV_BACKLOG.md](DEV_BACKLOG.md).
