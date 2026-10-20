## Thay đổi gì

<!-- Một hai câu: vấn đề / tính năng, hạng mục backlog (vd PF-02, BRIEF-01) -->

## Kiểm tra đã chạy

- [ ] `npm test` (unit) và `npm run lint`
- [ ] `npm run test:int` trong `backend` (PostgreSQL thật) — bắt buộc khi đổi ghi dữ liệu, khoá, transaction, hàng đợi
- [ ] Audit giao diện điện thoại (`frontend`: `npx playwright test`, tài khoản `npm run seed:e2e`) — khi đổi giao diện
- [ ] `npm run eval` (AI thật, tốn phí) — chỉ khi đổi prompt / công cụ của cố vấn
- [ ] Không cần (giải thích):

Xem [docs/TESTING.md](../docs/TESTING.md) để biết mỗi lớp kiểm thử chứng minh được gì và không chứng minh được gì.

## Luồng chính đã thử tay

<!-- Đánh dấu những luồng bị ảnh hưởng và đã thử trên app chạy thật (local hoặc production) -->

- [ ] Đăng nhập / đăng ký / khảo sát
- [ ] Danh mục: ghi giao dịch, nhập CSV, lịch sử, sự kiện quyền
- [ ] Trang Hôm nay
- [ ] Cố vấn AI (hỏi, huỷ, hết lượt)
- [ ] Kế hoạch / mục tiêu / watchlist
- [ ] Thông báo trong app, Telegram, Web Push
- [ ] Bản tin (gửi thử, hàng đợi `npm run briefs:jobs`)

## Thay đổi dữ liệu

- [ ] Không đổi schema / dữ liệu
- [ ] Có migration: chỉ thêm (bảng / cột cho phép null / index) — chạy được trên dữ liệu cũ
- [ ] Có migration xoá / đổi cột hoặc chuyển đổi dữ liệu → mô tả bên dưới

**Đã thử migration trên bản sao dữ liệu thật?** <!-- có / chưa: cách thử -->

**Đối soát sau deploy:** <!-- vd `node --env-file=../.env dist/portfolio/reconcile.js` phải in "Khớp" -->

**Rollback:** <!-- Cách quay lại nếu lỗi: revert commit + migration ngược (SQL), hoặc khôi phục bản sao lưu pre-deploy (docs/OPERATIONS.md). Ghi rõ dữ liệu nào mất nếu khôi phục bản sao lưu. -->

## Biến môi trường / vận hành

<!-- Biến mới trong ~/apps/dautu/.env, cron, lệnh cần chạy tay sau deploy; cập nhật docs/OPERATIONS.md -->
