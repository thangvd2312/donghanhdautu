# Báo cáo bàn giao dev — đợt 21–23/10/2026

- Nền review: f42c4a5 (ngày 21/10). Bản cuối trên production: **ab97f66**. 28 commit, mỗi commit đều qua CI và deploy tự động (sao lưu DB → migration → reload web + worker → health check → kiểm nhịp tim worker).
- Tài liệu liên quan: [DEV_RESPONSE_N1-N6.md](DEV_RESPONSE_N1-N6.md) (biên bản sửa lỗi theo mẫu của review), [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md) (review gốc), [ARCHITECTURE.md](../ARCHITECTURE.md) (kiến trúc hiện tại).
- Mức bằng chứng cho mọi hạng mục dưới đây: **code + unit test + integration test PostgreSQL + test giao diện iPhone (Playwright, WebKit) chạy với cả web lẫn worker**, và CI xanh. Chưa có nghiệm thu luồng thật trên thiết bị của người dùng ngoài phần Telegram do chủ sản phẩm tự xác nhận.

## 1. Tình trạng so với review ngày 21/10

| Hạng mục trong review | Trạng thái |
|---|---|
| 6 lỗi N1–N6 | Đã sửa, có regression test; chi tiết trong DEV_RESPONSE_N1-N6.md |
| Nghiệm thu mobile, đăng ký / onboarding / deep-link | Đạt trên môi trường test; phát hiện và sửa thêm lỗi mất đích sau đăng nhập (2291c83) |
| NT-01 thông báo | Telegram: chủ sản phẩm xác nhận hoạt động trên thiết bị thật, không làm biên bản từng bước. **Web Push: chưa nghiệm thu.** |
| BIZ-01 gói trả phí | Ngoài phạm vi theo quyết định phát triển miễn phí |
| Backlog mục 7 (FREE-01 → FREE-10) | **Đã triển khai đủ 10 tính năng**, mục 2 |

## 2. Tính năng mới (backlog mục 7 + phát sinh)

| Mã | Tính năng | Commit | Ghi chú |
|---|---|---|---|
| — | Lịch sử cổ tức trên trang cổ phiếu, tỷ suất 12 tháng | 8732ff6 | Nguồn Vietcap từ 2018 |
| FREE-01 | Lịch sự kiện (cổ tức, thưởng, quyền mua, đại hội) cho mã giữ/theo dõi, nhắc trước 1–3 ngày | a30c83c | Cron trong worker; bảng `EventReminderSetting` |
| FREE-02 | So sánh 2–4 cổ phiếu: biểu đồ cùng mốc, hiệu suất, chỉ tiêu cùng kỳ | 98d3ffb | Ghi rõ kỳ khi khác nhau; không điền 0 khi thiếu |
| FREE-03 | Lọc cổ phiếu toàn thị trường, lưu bộ lọc, "lý do khớp" | 1f2aab9, 1a3b535 | Vietcap screening API; bảng `SavedScreen` |
| FREE-04 | Thu nhập cổ tức theo tháng: đã nhận / dự kiến, căn cứ, mức chắc chắn | 14b65f7 | Dùng chung logic chống ghi trùng với gợi ý ghi sổ |
| FREE-05 | Thử kịch bản: sốc giá theo nhóm / mã, tỷ giá áp một lần | 0df37d9 | Không ghi sổ; "trước" khớp màn Danh mục |
| FREE-06 | Tái cân bằng: tỷ trọng mục tiêu, tiền mới, chỉ mua / cho bán, lô, phí | c5ea5f6 | Thuật toán tất định, có test thuộc tính |
| FREE-07 | Luyện tập tiền ảo: lệnh thị trường, phí, lô, vị thế, lịch sử, reset | 2fefe78 | Bảng `PaperAccount`, `PaperTrade`; tách hẳn danh mục thật |
| FREE-08 | Nhật ký quyết định: nhãn lý do / cảm xúc, tổng kết tháng, tách "đúng kế hoạch" khỏi lãi/lỗ | 809d29f | Thêm cột vào `Transaction`, `PlanReview`; không tạo hệ thống riêng |
| FREE-09 | Cảnh báo tình trạng danh mục: tập trung, lệch tỷ trọng, giảm từ đỉnh (loại dòng vốn) | 809d29f | Mặc định tắt; bỏ qua khi giá thiếu / cũ; bảng `PortfolioAlertRule` |
| FREE-10 | Báo cáo tháng: xem trước, PDF (in từ trình duyệt), CSV, ẩn số tiền / mã | 809d29f | Số liệu đối chiếu bằng integration test với các API màn hình |
| — | Thẻ xem trước khi chia sẻ link (Open Graph, ảnh 1200×630, tiêu đề theo trang) | f2f98e1 | |

Một thay đổi bị hoàn tác theo ý chủ sản phẩm: popup thông báo trên điện thoại (02c0530, 059bb55 → revert 7cc2278, 4f8c97f). Giữ popup gốc.

## 3. Kiến trúc (giữ nguyên hành vi, có đối chiếu trước / sau)

| Bước | Nội dung | Commit | Bằng chứng không đổi hành vi |
|---|---|---|---|
| Tách file lớn | Vietcap provider → adapter theo mảng sau một HTTP client có giới hạn tần suất / host; module danh mục → core, transactions, analysis, dividends | 1f0187a | 101 route và 24 phản hồi giống hệt |
| Gói JS | Vendor chunk ổn định; vỏ đã đăng nhập và socket tải khi cần | 52944a4 | Trang đăng nhập −30% JS, nhanh hơn ~33% (3G giả lập) |
| Cache thị trường | Bảng `MarketCache` + LRU bộ nhớ, single-flight, dùng dữ liệu cũ khi nguồn lỗi; cầu dao ngắt theo host | 07a77e6 | Khởi động lại: 0 lần gọi Vietcap cho 13 dữ liệu cache được |
| Worker | `dist/worker.js` chạy cron, hàng đợi, gửi Telegram / Web Push; khoá advisory Postgres; nhịp tim; deploy kiểm worker | bf2bc8d | 2 worker kích cùng job → chạy 1 lần |
| Contracts | Gói kiểu `@dautu/contracts` dùng chung FE/BE, chỉ import kiểu | dd7f9c1 | Tìm và sửa 20 chỗ FE/BE hiểu lệch |
| Gỡ cột thừa | Phản hồi dựng theo từng trường; bỏ `userId`, `hash`, `answers`, `planId`, `goalId`… | 9c2ba24 | ~60 API so với contracts: 0 cột thừa |
| Dọn & tách module | Mọi `*.module.ts` chỉ khai báo; controller / service / dto / presenter / logic; FE có lớp `api/`, `hooks/`, component theo mảng; xoá code chết | ab97f66 | 111 route, 66 phản hồi, 28 ảnh trang: giống hệt (trừ giá đang chạy) |

Trạng thái production hiện tại: `/api/health` → `{"ok":true,"worker":{"ok":true,…}}`.

## 4. Kiểm thử tại bản cuối (ab97f66)

| Lớp | Kết quả |
|---|---|
| Unit backend | 58 suites, **641/641** (đầu đợt: 171) |
| Integration PostgreSQL (`dautu_test`) | 24 suites, **122/122**, chạy 2 lần liền |
| Giao diện iPhone 11 Pro (Playwright, WebKit), web + worker thật | **87/87**, 78 màn hình, 0 lỗi tràn khung / nút nhỏ |
| Kiểm kiểu, lint, knip (code chết) | Sạch cả backend và frontend |

Nguyên tắc môi trường test: integration dùng `dautu_test`; server chạy thử (web + worker) chỉ dùng `dautu_e2e`; không chạy server trên `dautu_test` vì worker sẽ tranh hàng đợi với test (đã gây lỗi chập chờn ngày 21/10, nay hết).

## 5. Thay đổi dữ liệu

7 migration, tất cả chỉ **thêm** (bảng mới hoặc cột cho phép trống), không sửa / xoá dữ liệu cũ, không cần backfill:
`event_reminders`, `saved_screens`, `paper_trading`, `market_cache`, `worker_heartbeat`, `journal_tags`, `portfolio_alert_rules`.
Mỗi lần deploy đều sao lưu DB trước ở `~/backups/dautu/pre-deploy/`. **Chưa thử khôi phục từ bản sao lưu** (xem mục 7).

## 6. Giới hạn đã biết

- Nguồn dữ liệu Vietcap / DNSE / vang.today vẫn là API công khai không hợp đồng. Đã có giới hạn tần suất, cầu dao ngắt và cache bền để chịu lỗi tạm thời; đã từng bị chặn IP khi gọi dồn dập lúc phát triển.
- Lịch sự kiện: Vietcap không có giá mua của quyền mua; "mua chậm nhất phiên…" chưa trừ ngày lễ; sự kiện chưa có ngày GDKHQ không xếp vào lịch.
- Lọc cổ phiếu theo tỷ suất cổ tức: tính ở ứng dụng trên tối đa 300 mã khớp các điều kiện còn lại, có ghi chú khi chạm giới hạn.
- Benchmark VN-Index là chỉ số giá: kỳ có cổ tức chỉ hiển thị tham khảo, không kết luận hơn / kém.
- Cảnh báo "giảm từ đỉnh" mới được kiểm bằng test; chưa thấy báo thật vì dữ liệu test thiếu lịch sử tỷ giá (đúng với thiết kế: thiếu dữ liệu thì không báo).
- Báo cáo PDF dùng chức năng in của trình duyệt; trên iOS ở chế độ thêm vào màn hình chính phải mở bằng Safari.
- Thông báo do worker tạo tới trình duyệt chậm tối đa ~2 giây (web quét bảng `Notification`).

## 7. Việc còn lại

- [ ] **NT-01 Web Push**: thử trên thiết bị thật (Android Chrome, iOS 16.4+ ở chế độ thêm vào màn hình chính).
- [ ] **Khôi phục thử** bản sao lưu gần nhất vào một DB tạm trên server, đếm số dòng so với DB thật, rồi xoá DB tạm. Cần người có quyền trên server chạy.
- [ ] Dùng thử trên điện thoại thật vài ngày và ghi nhận điểm khó hiểu; các tính năng mới mới qua giả lập iPhone.
- [ ] `README.md` còn link tới các file `docs/` đang bị xoá trong working tree (OPERATIONS, TESTING, ANALYTICS, AI_COSTS, BIZ_COST_MODEL); sửa khi chốt xoá.
