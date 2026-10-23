# Phản hồi dev cho N1–N6

- Ngày: **21/10/2026**. Nền review: f42c4a5. Bản sửa: 3a6530a → 6234a09 (5 commit, mỗi commit một lỗi; N3 và N6 chung một commit vì cùng sửa `history.ts`).
- Theo mẫu của [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md) mục 6: **Mã → xác nhận/giải thích → commit → test trước/sau → ảnh hưởng dữ liệu cũ → bằng chứng nghiệm thu**.
- Mức bằng chứng: tất cả mới ở mức **có code + test local + test tích hợp PostgreSQL local**. Chưa có nghiệm thu luồng thật trên production, chưa có kết quả CI của các commit này.

## Bằng chứng chung (chạy trên commit 6234a09)

| Lớp kiểm tra | Kết quả |
|---|---|
| Unit backend (`npx jest`) | 22 suites, **213/213 đạt** (trước: 171) |
| Integration PostgreSQL (`npm run test:int`, DB `dautu_test` local) | 11 suites, **54/54 đạt** (trước: 51) |
| Backend `tsc --noEmit`, eslint `--max-warnings 0` | Sạch |
| Frontend `npm run build`, `npm run lint` | Sạch; còn cảnh báo chunk chính lớn như trước |

Test “trước” dưới đây là kết quả tái hiện của review trên f42c4a5. Riêng phần Dietz/XIRR của N3 đã chạy test mới trên code cũ và xác nhận **2 test thất bại** trước khi sửa. Các test mới khác chưa được chạy riêng trên code cũ.

## N1 — HOME-01 bỏ sót cổ tức và phí riêng

- **Xác nhận.** `dayLedger` bỏ giao dịch không có quantity; `dayChange` coi tiền mặt thay đổi bằng 0.
- **Sửa:** thêm `dayIncomeOf` theo cùng quy tắc tiền của sổ: cổ tức = tiền − phí − thuế; phí riêng = −(tiền + phí + thuế); nạp/rút/bonus chỉ tính phí, thuế; tiền nạp/rút là vốn, không vào lợi nhuận; phí mua/bán giữ ở phần giao dịch, không trừ hai lần. Cổ tức gắn với mã có biến động thì cộng vào mã đó. Thêm ghi chú “Đã gồm cổ tức…”, “Đã trừ các khoản phí riêng…”.
- **Commit:** 3a6530a.
- **Trước/sau:** tái hiện review (100 cp giá không đổi, cổ tức 100.000đ, phí riêng 10.000đ): changeVnd **0 → +90.000đ (+9%)**.
- **Test mới (9):** cổ tức, cổ tức sau thuế, phí riêng, phí trên nạp/rút/bonus, USDT, không trừ phí mua/bán hai lần, cổ tức của mã ngoài sổ; đối soát changeVnd = tài sản cuối − tài sản đầu − vốn ròng trong một ngày có đủ các loại giao dịch.
- **Dữ liệu cũ:** không đổi, chỉ thay cách tính khi hiển thị.
- **Giới hạn:** phí trên giao dịch `opening` vẫn coi là vốn như sổ hiện tại. Đối soát ở mức unit, chưa chạy qua DB.

## N2 — DATA-01/PF-03 làm mất trạng thái giá cũ khi lưu lịch sử

- **Xác nhận.** `recordDaily` lưu giá vàng có buy > 0 và tỷ giá stale theo ngày hiện tại.
- **Sửa:** chỉ lưu giá vàng/tỷ giá vào `PriceDaily` khi trạng thái nguồn là `fresh`; stale/fallback bỏ qua và ghi log. Ngày bị bỏ qua dùng bản ghi thật gần nhất, quá `MAX_GAP` thì đánh dấu ước tính. Cron và lần chạy sau restart dùng chung hàm nên đều được chặn.
- **Commit:** 8f904c6.
- **Trước/sau:** tái hiện review (cache vàng từ 10/10 lưu ngày 21/10, nguồn phục hồi 22/10, khai báo 1 lượng ngày 21/10): **complete / isEstimate=false → ngày 21/10 không complete, kỳ isEstimate=true, có trong uncertainOpenings**.
- **Test mới:** `history.service.spec.ts`: vàng stale không lưu, chạy lại kiểu restart không lưu, mất nguồn rồi phục hồi, vàng fresh có lưu, tỷ giá chỉ lưu khi fresh.
- **Dữ liệu cũ:** không có migration. Các bản ghi `PriceDaily` đã lỡ lưu từ cache cũ trước bản sửa **không phân biệt được** với bản ghi đúng và vẫn còn; bản sửa chỉ chặn từ nay.
- **Giới hạn:** ngưỡng “fresh” của vàng vẫn là 36 giờ theo updatedAt của nguồn (giữ nguyên ngưỡng hiện có).

## N3 — PF-03 bỏ qua lợi nhuận ngày bán rồi rút hết tiền

- **Xác nhận.** TWR coi mọi dòng tiền vào đầu ngày; ngày bán rồi rút hết có mẫu số ≤ 0 và bị bỏ qua âm thầm.
- **Sửa:** quy ước thời điểm thống nhất cho **TWR, Modified Dietz và XIRR**: nạp coi như vào đầu ngày, rút coi như cuối ngày (sau khi bán). Ngày vẫn không có mẫu số hợp lệ được đếm `unresolvedDays`: TWR trả null, kỳ là ước tính, có ghi chú lý do. Benchmark không kết luận khi TWR null.
- **Commit:** df3430b.
- **Trước/sau:** tái hiện review (mua 100, giá 110, bán 121 rồi rút hết 121): **TWR 10% → 21%**; Modified Dietz 21,85% → **21%**; XIRR kỳ 122 ngày khớp 1,21^(365/122) − 1.
- **Test mới:** rút hết, rút một phần, đóng rồi nạp lại, ngày không tính được → null + ước tính + ghi chú, benchmark không kết luận khi TWR null, Dietz và XIRR cùng giả định rút cuối ngày.
- **Dữ liệu cũ:** không đổi dữ liệu; số % của các kỳ có rút tiền có thể thay đổi nhẹ khi xem lại (lệch một ngày trọng số dòng rút).

## N4 — BRIEF-01 cho phép đảo lỗ thành lãi qua kiểm số

- **Xác nhận.** Dấu bị bỏ khi tách số và khi so (`Math.abs`); số không gắn với chỉ tiêu/tài sản; nhãn “đã đối chiếu” nói quá.
- **Sửa:** mỗi số trong lời AI chỉ được chấp nhận khi khớp đồng thời: giá trị (theo mức làm tròn), loại %/tiền, dấu (dấu +/− hoặc từ lãi/lời/tăng/dương vs lỗ/giảm/âm/sụt/mất đứng ngay trước), và tài sản nếu mệnh đề có nêu tài sản. Không khớp: viết lại một lần, vẫn sai thì bỏ phần AI viết như trước. Nhãn đổi thành “…giá trị, dấu, đơn vị và tài sản của các con số đã được đối chiếu với bảng trên; ý nghĩa lời văn chưa được kiểm tự động”.
- **Commit:** c7fa4dc.
- **Trước/sau:** `unmatchedNumbers("Danh mục lãi +1 triệu đồng.", profit = -1000000)`: **[] → ['+1 triệu']**.
- **Test mới:** đảo dấu (+/−, lãi/lỗ, tăng/giảm), đổi % thành tiền và ngược lại, gán số của tài sản A cho B, các câu đúng nhiều tài sản vẫn qua, luồng viết lại/bỏ đoạn.
- **Dữ liệu cũ:** không ảnh hưởng.
- **Giới hạn:** chưa phân biệt chỉ tiêu cùng giá trị cùng dấu (vd lãi tuần vs lãi luỹ kế); dấu chỉ đọc từ 3 từ trước số; bản tin sáng/chiều dùng chung hàm nên kiểm chặt hơn và vẫn gửi kèm ghi chú cảnh báo như trước.

## N5 — GOAL-01 validate mã chuẩn hóa nhưng lưu mã gốc

- **Xác nhận.** `validate` viết hoa một bản sao; `create`/`update` lưu `dto.allocations` gốc; đọc và tính tổng so mã chính xác.
- **Sửa:** chuẩn hóa một lần (trim + viết hoa, cùng quy tắc với holding) và dùng chung mảng đó cho validate và lưu; khi đọc/tính tổng so theo mã chuẩn hóa nên dòng cũ chữ thường vẫn khớp.
- **Commit:** 6234a09.
- **Trước/sau:** tái hiện review (A dùng fpt 60%, B dùng FPT 60%): **cả hai được nhận, tổng 120%, A tiến độ 0đ → B bị từ chối “chỉ còn 40%”, lưu `FPT`, A khớp holding**.
- **Test mới:** unit cho create/update với `fpt`/`FPT`/` Fpt `, trùng mã khác hoa thường trong một mục tiêu; integration PostgreSQL: tạo lower rồi upper bị chặn, update lưu dạng chuẩn, **tạo đồng thời `fpt` và `FPT` chỉ một yêu cầu thành công**.
- **Dữ liệu cũ:** DB local (dump từ prod) và production (21/10, chỉ đọc): 0 dòng `GoalAllocation` chưa chuẩn hóa, 0 người dùng vượt 100% sau chuẩn hóa, 0 holding chưa chuẩn hóa → không cần migration.

## N6 — PF-03 kết luận hơn/kém khi khác cơ sở lợi suất

- **Xác nhận.** Khác biệt “TWR gồm cổ tức, VN-Index là chỉ số giá” chỉ nằm trong ghi chú, không chặn `conclusive`.
- **Sửa:** không thêm nguồn chỉ số tổng lợi suất. Kỳ có cổ tức (`period.dividends > 0`) thì `conclusive = false` kèm ghi chú khác cơ sở; giao diện ghi VN-Index “(chỉ để tham khảo, chưa so được hơn / kém)” và chỉ hiển thị hơn/kém khi conclusive. Kỳ không có cổ tức hai bên cùng cơ sở nên vẫn kết luận như trước.
- **Commit:** df3430b.
- **Trước/sau:** tái hiện review (VN-Index 1.200 → 1.200, TWR +5%, kỳ có cổ tức): **conclusive true → false**, excessPts vẫn báo 5 để tham khảo.
- **Test mới:** kỳ có cổ tức không kết luận; `periodPerformance` báo cổ tức trong kỳ.
- **Dữ liệu cũ:** không ảnh hưởng.
- **Giới hạn:** cổ tức USDT chưa có tỷ giá không được tính vào `dividends` (sổ đã cảnh báo trường hợp này).

## Deploy và CI

| Commit | Nội dung | CI/CD (check + deploy) |
|---|---|---|
| 3a6530a → 8732ff6 | N1–N6 + lịch sử cổ tức trang cổ phiếu | Đạt (run 39547213740): build, unit, integration PostgreSQL, lint, backup DB trước deploy, migrate, health check |
| 2291c83 | Sửa deep-link sau đăng nhập/đăng ký (phát hiện khi nghiệm thu mobile, xem dưới) + e2e | Đạt (run 39551103546) |

Không có migration trong các commit này. DB được sao lưu tự động trước mỗi lần deploy (`~/backups/dautu/pre-deploy/`); **chưa thử khôi phục** từ bản sao lưu trong lần này.

## Nghiệm thu mobile, đăng ký / onboarding / deep-link

- Môi trường: build của 8732ff6 (+ bản sửa 2291c83 cho lần chạy lại), backend riêng trỏ DB `dautu_test` local, không có khóa Telegram/Web Push/AI; Playwright iPhone 11 Pro (WebKit), đối chứng Pixel 7 (Chromium).
- Bộ có sẵn `frontend/e2e` (mobile + chart): **44/44 đạt**, audit giao diện 0 lỗi trên 43 màn hình.
- Bộ có sẵn chỉ mở form đăng ký/khảo sát, không đi hết luồng và không có deep-link. Kiểm thêm bằng kịch bản riêng:

| Luồng | Trên 8732ff6 | Sau 2291c83 |
|---|---|---|
| Đăng ký → làm hết khảo sát → trang chủ, tải lại không quay lại khảo sát | Đạt (đích khảo sát là `/register` thay vì `/`) | Đạt |
| Chưa đăng nhập mở `/stock/FPT?from=push` → đăng nhập | **Lỗi: về `/`** | Đạt: về `/stock/FPT?from=push` |
| Chưa đăng nhập mở `/stock/HPG` → Đăng ký → khảo sát → “Để sau” | **Lỗi: về `/`** | Đạt: về `/stock/HPG` |
| Tài khoản chưa khảo sát đăng nhập qua `/plans?tab=1` → “Để sau” | **Lỗi: về `/`** | Đạt: về `/plans?tab=1` |
| Sai mật khẩu giữ đích; `?next=//evil…` bị chặn | Đạt | Đạt |
| Đã đăng nhập mở link (trường hợp bấm thông báo) | Đạt | Đạt |
| Khung “Lịch sử cổ tức”: FPT, mã không trả tiền mặt (VIC), lỗi nguồn | Đạt | Đạt |

- Nguyên nhân lỗi deep-link: ngay khi có thông tin người dùng, App chuyển sang nhánh đã đăng nhập (không có route `/login`) trước khi trang đăng nhập kịp điều hướng tới `next`, nên rơi vào route mặc định `/`; với tài khoản chưa khảo sát, đích khảo sát thành `/login?next=…` và bị `safeNext` loại. Sửa: nhánh đã đăng nhập đọc `?next` của `/login`, `/register` làm đích và làm đích của khảo sát.
- Regression: `frontend/e2e/auth-flow.spec.ts` (8 test). Có bản sửa 8/8 đạt; bỏ bản sửa thì thất bại ngay ở test đầu. Lặp các luồng deep-link 3 lần trên mỗi engine: 12/12 đạt.
- Không phải nghiệm thu trên thiết bị thật và production; luồng bấm thông báo thật nằm trong NT-01.

## Kiểm dữ liệu production (chỉ đọc, 21/10/2026)

Chạy bằng phiên `default_transaction_read_only = on`.

- **N5:** 0 mục tiêu, 0 dòng phân bổ trên production; 0 holding có mã chưa chuẩn hoá → không có dữ liệu cũ bị ảnh hưởng, không cần migration.
- **N2:** `PriceDaily` vàng/tỷ giá mới có dữ liệu từ 20/10 (2 ngày, 18 mã). Chỉ một bản ghi trùng giá với ngày trước: vàng DOJINHTV ngày 21/10 — có thể là giá không đổi hoặc giá cũ lưu trước khi bản sửa N2 được deploy, không phân biệt được. Ảnh hưởng giới hạn ở tài sản khai báo đúng loại vàng này ngày 21/10. Quyết định: giữ nguyên, không sửa dữ liệu production.

## Việc còn lại trước khi đóng

- [x] Reviewer xem lại các commit 3a6530a → 2291c83 (chủ sản phẩm đã duyệt từng bước và cho deploy).
- [x] Kết quả CI của commit cuối: mọi commit từ 3a6530a tới ab97f66 đều xanh và đã deploy.
- [x] Chạy truy vấn chỉ đọc kiểm mã mục tiêu (N5) và giá lưu theo ngày (N2) trên production.
- [x] Nghiệm thu mobile, đăng ký/onboarding/deep-link (môi trường test local, xem trên).
- [x] NT-01 (Telegram): chủ sản phẩm xác nhận ngày 21/10/2026 đã thấy kênh Telegram hoạt động trên thiết bị thật và quyết định không làm nghiệm thu từng bước. Không có ảnh chụp/biên bản cho các mục bấm mở qua đăng nhập, tắt loại tin với tác vụ đang chờ, giờ yên lặng, nội dung riêng tư. Web Push chưa nghiệm thu.
- [ ] Thử khôi phục từ bản sao lưu DB.
- [ ] Nghiệm thu luồng thật Home/Lịch sử/Bản tin trên production.

Các việc tiếp theo (tính năng mục 7, kiến trúc) được tổng hợp trong [DEV_REPORT_2026-10.md](DEV_REPORT_2026-10.md).
