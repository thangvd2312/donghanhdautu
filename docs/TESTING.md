# Kiểm thử

Mỗi lớp kiểm thử chứng minh một phần. Build thành công không có nghĩa là nghiệp vụ đúng, và unit test đạt không có nghĩa là AI trả lời đúng.

| Lớp | Lệnh | Chạy ở | Chứng minh | Không chứng minh |
|---|---|---|---|---|
| Typecheck + build | `npm run build` | CI | Code biên dịch được, bundle tạo được | Logic đúng |
| Unit | `npm test` | CI | Phép tính thuần: sổ giao dịch, giá vốn, lịch sử và hiệu quả theo kỳ, hôm nay, mục tiêu, kế hoạch, quy tắc thông báo, CSV, phát hiện sự kiện quyền, kiểm số bản tin, đọc dữ liệu nguồn | Hành vi với DB thật, khoá, đồng thời |
| Tích hợp PostgreSQL | `npm run test:int` (trong `backend`) | CI (service postgres) | Ghi DB thật: chống trùng nhập CSV, khoá khi ghi đồng thời (mục tiêu, watchlist, quota AI), bản tin mỗi kỳ một lần, hàng đợi bản tin (SKIP LOCKED, retry, hết hạn), thông báo + việc gửi cùng transaction, giao thức Telegram / Web Push với server giả, luồng chat (quota, huỷ, lỗi model), báo cáo sử dụng | Gửi thật tới Telegram / thiết bị, model AI thật |
| Lint | `npm run lint` | CI | Quy ước code, không cảnh báo | — |
| Giao diện điện thoại | `npx playwright test` (trong `frontend`) | Tay, trước PR đổi giao diện | 44 màn hình trên iPhone 11 Pro (WebKit): tràn ngang, chữ ô nhập < 16px, hộp thoại khuất, vùng bấm < 32px, lỗi JavaScript | Đúng nghiệp vụ, đẹp |
| Tải trang | `npm run perf:load` (trong `frontend`) | Tay khi đổi bundle | Thời gian và KB tải trang khách trên mạng chậm giả lập | Thiết bị thật |
| Eval AI | `npm run eval` (trong `backend`) | Tay, tốn phí AI | Chất lượng trả lời cố vấn trên bộ câu hỏi cố định (chấm điểm bằng AI) | Mọi câu hỏi thật |
| Đối soát dữ liệu | `node --env-file=../.env dist/portfolio/reconcile.js` | Server sau deploy đổi sổ | Bảng Holding khớp sổ giao dịch cho mọi người dùng | — |

## Chạy test tích hợp ở máy

```bash
docker exec dautu-postgres psql -U dautu -d dautu -c "CREATE DATABASE dautu_test"   # lần đầu
cd backend
DATABASE_URL=postgresql://dautu:dautu@localhost:5434/dautu_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://dautu:dautu@localhost:5434/dautu_test npm run test:int
```

Test chỉ chạy trên database có tên kết thúc bằng `_test`. Mỗi test tạo người dùng riêng nên chạy lại không cần dọn DB.

## Audit giao diện các trang cần đăng nhập

```bash
cd backend && npm run build
DATABASE_URL=postgresql://dautu:dautu@localhost:5434/dautu_test JWT_SECRET=e2e-secret npm run -s seed:e2e > /tmp/e2e-token
DATABASE_URL=postgresql://dautu:dautu@localhost:5434/dautu_test JWT_SECRET=e2e-secret PORT=3998 LLM_API_KEY= node --env-file=.env dist/main &
cd ../frontend && npm run build
E2E_BASE_URL=http://localhost:3998 E2E_TOKEN=$(cat /tmp/e2e-token) npx playwright test
```

Tài khoản `e2e@local` có sẵn cổ phiếu, coin, tiền mặt, kế hoạch, mục tiêu, watchlist, hội thoại và cảnh báo. Đặt `LLM_API_KEY=` để không gọi AI thật. Màn hình nào có lỗi giao diện thì test của màn hình đó thất bại; ảnh chụp nằm trong `e2e-results/`.

## Thông báo trên thiết bị thật

Xem [NOTIFICATIONS_TEST.md](NOTIFICATIONS_TEST.md).
