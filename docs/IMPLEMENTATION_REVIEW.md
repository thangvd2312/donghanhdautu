# Review mức hoàn thành so với backlog

> **Cập nhật 26/10/2026:** tài liệu này là kết quả review tại mốc f42c4a5 (21/10). Sau đó N1–N6 đã được sửa ([DEV_RESPONSE_N1-N6.md](DEV_RESPONSE_N1-N6.md)), FREE-01 → FREE-10 đã triển khai và chạy trên production ở ad1bf5f, NT-01 đã được chủ sản phẩm thử trên thiết bị thật cho cả Telegram và Web Push ([DEV_REPORT_2026-10.md](DEV_REPORT_2026-10.md)). Các mục "còn mở" bên dưới phản ánh mốc 21/10; tiêu chí nghiệm thu vẫn dùng được.

- Cập nhật: **21/10/2026**.
- Phiên bản được kiểm tra: **f42c4a5d603b3a9f53ab463ed305144374aff7c3**.
- Phạm vi review gốc: 15 hạng mục và các vấn đề R1–R7 ngày 20/10. Theo quyết định mới của chủ sản phẩm, BIZ-01 nằm ngoài phạm vi; còn 14 hạng mục kỹ thuật trong phạm vi nghiệm thu cũ.
- Bằng chứng: đọc source/test/CI, kiểm tra local và các tái hiện nghiệp vụ trên cùng phiên bản. **Không phải xác nhận nghiệm thu production.**
- Tài liệu này thay thế các kết luận hiện trạng cũ. Kết quả ngày 20/10 được giữ trong phụ lục lịch sử cuối file.
- Các tài liệu DEV_BACKLOG.md, PRODUCT_ROADMAP.md và NOTIFICATIONS_TEST.md đang bị xóa trong working tree tại thời điểm cập nhật; không khôi phục hoặc tạo lại trong lần đồng bộ này. Danh sách hạng mục và việc nghiệm thu cần thiết được ghi trực tiếp bên dưới.

## Quyết định sản phẩm: phát triển miễn phí

Theo yêu cầu của chủ sản phẩm: **ưu tiên xây nhiều tiện ích hữu ích cho người dùng, không triển khai gói trả phí trong phạm vi hiện tại**.

- BIZ-01 được loại khỏi phạm vi, không tính là việc chưa hoàn thành và không phải điều kiện phát hành.
- Không đưa paywall, subscription hoặc thanh toán vào backlog mở rộng.
- Giữ đo lường sử dụng và kiểm soát chi phí AI để vận hành sản phẩm miễn phí; giới hạn tài nguyên nếu cần không gắn với yêu cầu nâng cấp trả tiền.
- Đánh giá tính năng bằng mức sử dụng, giá trị người dùng nhận được, độ chính xác và khả năng dùng lại.
- Backlog tính năng mới ở mục 7 là đề xuất để giao dev, chưa phải các tính năng đã được triển khai.
- Trong workspace đang có thay đổi source/test để xử lý các phát hiện. Trạng thái kỹ thuật dưới đây vẫn là kết quả review mốc f42c4a5; cần review lại bản sửa trước khi đóng lỗi.

## 1. Kết luận tại mốc review

**Chưa hoàn thành toàn bộ.** Phần lớn tính năng đã có triển khai, các case R1–R7 đã có bản sửa và test tương ứng. Tuy nhiên còn **6 vấn đề ảnh hưởng 5 hạng mục**, cộng phần nghiệm thu thiết bị thật của NT-01. BIZ-01 đã được loại khỏi phạm vi theo quyết định phát triển miễn phí.

| Nhóm đánh giá | Số hạng mục | Hạng mục |
|---|---:|---|
| Có triển khai, chưa thấy lỗi chặn mới trong phạm vi review | 8 | OBS-01, AI-01, QA-01, WL-01, ACQ-01, PF-01, PF-02, PLAN-01 |
| Có triển khai nhưng còn lỗi cần sửa | 5 | DATA-01, HOME-01, PF-03, BRIEF-01, GOAL-01 |
| Có triển khai, còn nghiệm thu kênh thật | 1 | NT-01 |
| Ngoài phạm vi hiện tại, không tính vào việc còn thiếu | 1 | BIZ-01 |

“Chưa thấy lỗi chặn mới” không đồng nghĩa đã nghiệm thu mọi luồng production. **Không dùng lại mức 60–65% hoặc 63% của review ngày 20/10 để mô tả phiên bản hiện tại.** Không quy số hạng mục có code thành phần trăm nghiệm thu khi khối lượng và bằng chứng của từng mục khác nhau.

TWR, XIRR và benchmark **đã có code**, không còn thuộc nhóm chưa triển khai. Phần này vẫn có vấn đề N3 và N6 bên dưới.

## 2. Đối chiếu 15 hạng mục

| ID | Đã có trong source | Trạng thái / việc còn lại |
|---|---|---|
| DATA-01 | Giá có fresh/stale/fallback/missing, nguồn/thời điểm; tách phần thiếu giá; lãi crypto theo USDT và VND khi đủ tỷ giá | **Cần sửa N2:** giá cũ lưu vào lịch sử mất nhãn chất lượng |
| OBS-01 | Từ điển sự kiện, lọc thuộc tính, retention, activation/D7/D30, phễu, import errors, bản tin, kế hoạch, chất lượng và chi phí | Có triển khai; cần báo cáo thực với cohort đủ tuổi để nghiệm thu chỉ số, không suy ra retention chỉ từ việc có truy vấn |
| AI-01 | Usage theo chức năng/người/model, chi phí không rõ giữ null, quota, xử lý lịch sử dài, hàng đợi bản tin/retry | Có triển khai; quota theo người được khóa. Ngân sách chung kiểm chi phí đã ghi nhận, **không bảo đảm trần tuyệt đối khi nhiều lượt đang chạy** |
| QA-01 | CI build/unit/PostgreSQL/lint; mobile audit assert lỗi; chia bundle/nén; backup trước migration | Local unit/build/lint đạt ở phiên bản này; cần kết quả CI/mobile/eval đúng commit để nghiệm thu các lớp còn lại |
| WL-01 | Stock/crypto/gold, thêm/xóa, ownership, chống trùng, khóa giới hạn số mã khi thêm đồng thời | Có triển khai và test; chưa xác minh luồng thật trong lần review này |
| ACQ-01 | Demo công khai, nhãn dữ liệu mẫu, khảo sát “Để sau”, giữ next qua đăng ký/khảo sát, đo phễu | Có triển khai; cần nghiệm thu guest → đăng ký → bỏ qua/hoàn tất khảo sát → đúng trang đích |
| PF-01 | Sổ Decimal, bình quân giá vốn, mua/bán/nạp/rút/phí/cổ tức/bonus, sửa/hủy, kiểm ngày, chuyển holding, đối soát, gợi ý sự kiện quyền | Có triển khai; đối soát/migration/rollback trên dữ liệu thật chưa được xác minh lại trong lần này |
| PF-02 | CSV mapping/preview, chọn dòng nghi trùng, tác động, batch/undo; hash yêu cầu trước lọc trùng; preview chỉ đọc | Case R1 và preview đã có bản sửa, integration test retry/đồng thời/undo |
| PF-03 | Lịch sử dựng từ sổ, giá gốc cổ phiếu, Modified Dietz, TWR, XIRR từ kỳ 90 ngày, VN-Index cùng kỳ | **Cần sửa N2, N3, N6:** chất lượng giá lưu, ngày rút hết tiền, cơ sở lợi suất benchmark |
| HOME-01 | Tổng quan cá nhân, tin/bản tin/điểm cần xem lại, các khối độc lập; vị thế đầu ngày và mua/bán trong ngày | Case R2 đã sửa; **còn N1:** bỏ sót cổ tức và phí riêng |
| BRIEF-01 | Bảng số xác định, bản tin tuần, hỏi tiếp, bật/tắt, BriefRun/BriefJob, chống trùng/retry, đo mở/hỏi tiếp, kiểm số | Case R5 đã có bản sửa; **còn N4:** kiểm số không phát hiện đảo lỗ thành lãi |
| PLAN-01 | AI draft cần xác nhận, phiên bản, review/nhắc, giao dịch trước/trong/sau thời gian kế hoạch | Có triển khai; cần nghiệm thu luồng kế hoạch và quyền sở hữu trên phiên bản bàn giao |
| NT-01 | Telegram/Web Push opt-in, loại tin, giờ yên lặng, riêng tư, retry; notification và delivery cùng transaction; test giao thức giả lập | **Chờ nghiệm thu thiết bị/người nhận thật**, xem mục 6 |
| GOAL-01 | Phân bổ, tiến độ, mô phỏng, pause; validate/write cùng khóa theo người | Case race R4 đã có bản sửa; **còn N5:** chuẩn hóa mã khi kiểm tra khác dữ liệu lưu |
| BIZ-01 | Báo cáo chi phí và quota tiếp tục phục vụ vận hành miễn phí | **Ngoài phạm vi:** không triển khai gói trả phí/định giá/thanh toán; không tính là việc chưa làm |

Bằng chứng chính: [analytics/report.ts](../backend/src/analytics/report.ts), [ai-usage.service.ts](../backend/src/ai/ai-usage.service.ts), [watchlist.module.ts](../backend/src/watchlist/watchlist.module.ts), [transactions.ts](../backend/src/portfolio/transactions.ts), [plans.module.ts](../backend/src/plans/plans.module.ts), [App.tsx](../frontend/src/App.tsx).

## 3. Trạng thái các vấn đề R1–R7

Bảng này xác nhận bản sửa và test có trong source. Integration test, báo cáo mobile và production do dev ghi nhận trước đây chưa được xác minh lại độc lập trong lượt review này.

| Mã cũ | Bản sửa hiện có | Commit tham chiếu / giới hạn |
|---|---|---|
| R1 — CSV retry và preview | Hash ổn định theo yêu cầu trước phân loại trùng; preview dùng hàm chỉ đọc; có integration test retry, đồng thời, undo, preview | 0b8fcfb; chưa chạy lại DB thật ở lần review hiện tại |
| R2 — Hôm nay chưa xét mua/bán | Tính vị thế đầu ngày và giao dịch trong ngày; unit test mua mới, mua thêm, bán một phần/hết, phí | 0192beb; case cũ được bao phủ, nhưng còn N1 |
| R3 — Thiếu giá opening nhưng báo đầy đủ | Theo dõi uncertainOpenings và trạng thái kỳ; giá gốc cổ phiếu, fallback có đánh dấu | 55d6205, c8ace7a; còn đường lỗi lưu cache N2 |
| R4 — Race phân bổ mục tiêu | Validate và write cùng transaction/advisory lock; có integration test tạo/sửa đồng thời | e2ccde5; còn lỗi chuẩn hóa mã N5, không phải lỗi khóa đồng thời cũ |
| R5 — Trùng conversation | BriefRun duy nhất theo người/kỳ; lưu nội dung cùng transaction, dùng lại conversation; BriefJob có claim/retry/recovery | 98d3e90, fa4d056; có integration test, chưa chạy lại DB thật ở lần này |
| R6 — Notification lưu nhưng delivery mất | Lưu notification và ý định gửi cùng transaction; có rollback/retry test và test giao thức Telegram/Web Push | 43caadd, 9dd0f00; chưa chứng minh nhận trên thiết bị thật |
| R7 — Onboarding và audit mobile | Có “Để sau”, giữ next; audit assert danh sách lỗi JavaScript/giao diện | 3fa362b, 06fc0aa, 9d9872a; chưa chạy lại browser ở lần này |

Không giữ nhận định “chỉ còn người thật và product” của bản cập nhật trước: còn các lỗi nghiệp vụ N1–N6 tại mốc review cần xử lý và xác minh. Phần product về gói trả phí đã được loại khỏi phạm vi.

## 4. Các vấn đề còn mở

Các tình huống dưới đây đã được tái hiện ở lượt review cùng phiên bản f42c4a5, sau đó đối chiếu lại source và xác nhận đoạn xử lý chưa đổi. Dùng hàm/service thật từ bản build; thị trường, thời gian và kho lưu được giả lập trong bộ nhớ khi cần. **Không phải tái hiện qua HTTP hoặc PostgreSQL thật.**

### N1 — P1 — HOME-01 bỏ sót cổ tức và phí riêng

- Vị trí: [home.module.ts](../backend/src/home/home.module.ts), dayLedger dòng 65–82; [today.ts](../backend/src/home/today.ts), dayChange.
- Nguyên nhân: dayLedger loại giao dịch không có quantity, chỉ đưa buy/sell vào phần tính biến động; dayChange coi tiền mặt thay đổi bằng 0.
- Tái hiện: đầu ngày giữ 100 cổ phiếu giá 10.000đ, giá không đổi; nhận cổ tức 100.000đ rồi trả phí riêng 10.000đ, không nạp/rút.
- Kết quả: tổng tài sản cuối ngày 1.090.000đ, tăng đúng **90.000đ**; Home trả **changeVnd = 0**, không có ghi chú thiếu phần này.
- Nghiệm thu: tính cổ tức sau thuế và chi phí riêng, chỉ loại dòng tiền vốn khỏi lợi nhuận. Test cổ tức, phí riêng và phí trên các loại giao dịch hỗ trợ; đối soát với thay đổi tài sản trừ dòng vốn ở cùng mốc thời gian.

### N2 — P1 — DATA-01/PF-03 làm mất trạng thái giá cũ khi lưu lịch sử

- Vị trí: [history.service.ts](../backend/src/portfolio/history.service.ts), recordDaily dòng 309–325, storedSeries và price/usdt trong compute.
- Nguyên nhân: giá vàng buy > 0 được ghi theo ngày hiện tại mà không giữ thời điểm/chất lượng nguồn. Tỷ giá chỉ loại fallback, vẫn lưu stale. Khi đọc lại, tuổi dữ liệu được suy từ ngày bản ghi.
- Tái hiện: ngày 21/10 lưu giá vàng 100 triệu từ cache có updatedAt ngày 10/10; ngày 22/10 nguồn phục hồi ở 104 triệu. Danh mục khai báo 1 lượng ngày 21/10.
- Kết quả: cả hai ngày được trả **status = complete**, kỳ có **isEstimate = false**, dù giá ngày khai báo đã cũ.
- Nghiệm thu: bảo toàn thời điểm/chất lượng nguồn hoặc không ghi cache cũ thành giá chốt mới. Test vàng/tỷ giá mất nguồn nhiều ngày rồi phục hồi, cron và restart; không biến dữ liệu cũ thành đầy đủ.

### N3 — P1 — PF-03 bỏ qua lợi nhuận ngày bán rồi rút hết tiền

- Vị trí: [history.ts](../backend/src/portfolio/history.ts), timeWeightedReturn dòng 273–286 và periodPerformance.
- Nguyên nhân: khi prev.value + flow <= 0, hàm bỏ qua ngày đó nhưng không báo kết quả thiếu dữ liệu.
- Tái hiện qua buildHistory → periodPerformance: 1 cổ phiếu giá 100 ngày 01/07; giá 110 ngày 30/07; ngày 31/07 bán 121 rồi rút toàn bộ 121; không phí/nạp thêm.
- Kết quả: lợi nhuận tiền là 21 nhưng **TWR trả 10% thay vì 21%**, isEstimate vẫn false.
- Nghiệm thu: xử lý giá trị trước dòng tiền và thời điểm rút nhất quán. Nếu không đủ độ chi tiết để tính, trả null/ước tính có lý do thay vì bỏ ngày. Test rút hết, rút một phần, đóng rồi nạp lại; không kết luận benchmark từ kỳ chưa tính đủ.

### N4 — P1 — BRIEF-01 cho phép đảo lỗ thành lãi qua kiểm số

- Vị trí: [number-check.ts](../backend/src/alerts/number-check.ts), extractNumbers/unmatchedNumbers; [weekly.service.ts](../backend/src/alerts/weekly.service.ts), nhánh chấp nhận unmatched rỗng và gắn nhãn đối chiếu.
- Nguyên nhân: dấu bị bỏ khi tách số và khi so theo trị tuyệt đối; số chưa gắn với chỉ tiêu/tài sản.
- Tái hiện: unmatchedNumbers với câu “Danh mục lãi +1 triệu đồng.” và dữ liệu profit = -1000000 trả **mảng rỗng**, tức không phát hiện lỗi.
- Nghiệm thu: kiểm dấu, đơn vị, chỉ tiêu; ưu tiên số có cấu trúc/render bằng code. Chỉ bỏ Math.abs chưa đủ vì dấu đã mất ở bước tách số. Test đảo dấu, đổi % thành tiền, gán số tài sản A sang B; thu hẹp nhãn “đã đối chiếu” nếu chỉ kiểm được sự xuất hiện của số.

### N5 — P2 — GOAL-01 validate mã chuẩn hóa nhưng lưu mã gốc

- Vị trí: [goals.module.ts](../backend/src/goals/goals.module.ts), validate dòng 207 so với create dòng 139/update dòng 153; [goal-math.ts](../backend/src/goals/goal-math.ts).
- Nguyên nhân: validate tạo bản sao uppercase, nhưng lưu dto.allocations gốc; đọc/kiểm tổng so symbol chính xác.
- Tái hiện qua GoalsService với kho lưu giả lập: có holding FPT; tạo A dùng fpt 60%, rồi B dùng FPT 60%. Cả hai được chấp nhận, tổng cùng tài sản theo ý nghĩa **120%**; A còn bị tính tiến độ **0đ, held = false**.
- Nghiệm thu: chuẩn hóa một lần và dùng cùng dữ liệu để validate/lưu/read, hoặc từ chối mã không hợp lệ. Kiểm dữ liệu cũ trước khi quyết định sửa. Thêm test DB thật cho lower/uppercase, create/update và đồng thời.

### N6 — P2 — PF-03 kết luận hơn/kém khi khác cơ sở lợi suất

- Vị trí: [history.ts](../backend/src/portfolio/history.ts), compareBenchmark dòng 357–371; [HistoryPanel.tsx](../frontend/src/components/HistoryPanel.tsx), nhánh conclusive hiển thị “hơn/kém”.
- Nguyên nhân: TWR danh mục gồm cổ tức, VN-Index là chỉ số giá; code có ghi chú nhưng khác biệt này không chặn conclusive.
- Tái hiện: kỳ 30 ngày, dữ liệu đầy đủ, cổ phiếu chiếm 90%, VN-Index 1.200 → 1.200, TWR +5%. Hàm trả **excessPts = 5, conclusive = true**.
- Nghiệm thu: dùng benchmark cùng cơ sở lợi suất hoặc chỉ hiển thị tham khảo, conclusive = false khi khác cơ sở. Test kỳ có cổ tức; ghi chú khác biệt không thay thế điều kiện so sánh tương đương.

## 5. Bằng chứng kiểm thử và giới hạn

| Lớp kiểm tra | Bằng chứng cho phiên bản f42c4a5 |
|---|---|
| Unit backend | **20 suites, 171/171 test đạt**; đã chạy lại ở lượt đối chiếu gần nhất bằng Jest --runInBand --no-cache |
| Build frontend/backend, lint | Đạt ở lượt review cùng commit trước đó; frontend còn cảnh báo chunk chính khoảng 722 kB trước nén |
| PostgreSQL integration | Source có 11 suite, 51 test case; CI có bước chạy. Chưa chạy lại local: sandbox chặn initdb tạo shared memory và truy cập Docker socket |
| Tái hiện N1–N6 | Thực thi code nghiệp vụ/service với dữ liệu tổng hợp; không gọi model thật, không gửi thông báo thật hoặc dùng DB production |
| Mobile, performance | Docs trước đây ghi 44/44 màn hình và tải login 7,1 → 1,5 giây trên mạng giả lập; **chưa xác minh lại độc lập** |
| AI thật, deployment, đối soát production | **Chưa xác minh lại độc lập**; không coi ghi chú “đã deploy/health check đạt” là bằng chứng do lượt review này thực hiện |

Unit test hiện có chưa phủ đủ N1–N6. Có cấu hình CI không đồng nghĩa đã xem được kết quả CI của commit bàn giao. Test với model/server gửi tin giả lập không chứng minh chất lượng AI live hoặc việc thiết bị thật nhận tin.

Với AI-01, khóa hiện theo người dùng cho quota. Ngân sách chung cộng chi phí đã ghi nhận, không giữ trước ngân sách cho mọi lượt đang chạy; chi phí không rõ vẫn không cộng được vào tổng. Vì vậy không dùng mô tả “quota và ngân sách đều nguyên tử” hay cam kết không thể vượt trần chi tiêu.

Lần đồng bộ tài liệu này chỉ sửa file Markdown; không chạy lại build/test ứng dụng cho một thay đổi tài liệu.

## 6. Việc cần giao tiếp và tiêu chí đóng

### Dev

- [ ] Xử lý N1–N4 và thêm regression theo dữ liệu tái hiện.
- [ ] Xử lý N5, kiểm dữ liệu mã tài sản hiện có; xử lý điều kiện benchmark N6.
- [ ] Chạy build, lint, unit và integration PostgreSQL trên commit cuối; đính kèm kết quả CI và test mới.
- [ ] Nghiệm thu mobile, đăng ký/onboarding/deep-link; đính kèm bằng chứng đúng phiên bản bàn giao.
- [ ] Với thay đổi dữ liệu: đối soát, backup/khôi phục và ghi rõ ảnh hưởng dữ liệu cũ.

### NT-01 — Thử kênh thật với người nhận đã đồng ý

- [ ] Kết nối/xác nhận đích nhận và nhận được tin thử trên thiết bị thật.
- [ ] Nhận cảnh báo thật; bấm mở đúng nội dung, kể cả đi qua đăng nhập.
- [ ] Tắt loại tin có hiệu lực với cả tác vụ đang chờ; giờ yên lặng giữ/hoãn tin đúng.
- [ ] Nội dung riêng tư theo mặc định; trạng thái gửi/lỗi/retry có thể kiểm tra.

Backlog tối thiểu chỉ yêu cầu một kênh. Có thể nghiệm thu một kênh trước, nhưng phải ghi rõ kênh nào đã đạt và kênh nào được hoãn; không suy từ test Telegram sang Web Push hoặc ngược lại.

### Product — Chất lượng trải nghiệm miễn phí

- [ ] Chọn người dùng mục tiêu và vấn đề cụ thể cho từng đợt tính năng.
- [ ] Thử luồng với người dùng, ghi nhận điểm khó hiểu và nhu cầu quay lại.
- [ ] Theo dõi mức sử dụng và chi phí vận hành; không đặt chỉ tiêu chuyển đổi trả phí.
- [ ] Ưu tiên tính năng mới theo mục 7; sửa lỗi và mở rộng có thể triển khai song song. Chỉ chặn phát hành tính năng khi lỗi ảnh hưởng trực tiếp tới đầu vào/kết quả của nó.

Mỗi mục phản hồi theo mẫu: **Mã → xác nhận/giải thích → commit → test trước/sau → ảnh hưởng dữ liệu cũ → bằng chứng nghiệm thu**. Chỉ đóng theo bằng chứng phù hợp; tách rõ “có code”, “test local”, “test tích hợp” và “nghiệm thu luồng thật”.

## 7. Backlog mở rộng sản phẩm miễn phí

Các đề xuất dưới đây dựa trên cấu trúc và dữ liệu hiện có trong repository. Chúng là giả thuyết sản phẩm cần kiểm chứng với người dùng, không phải kết luận từ nghiên cứu thị trường. Chưa gán thời hạn vì cần dev đánh giá nguồn dữ liệu và công sức.

### Đợt A — Giúp người dùng theo dõi và tìm hiểu tài sản

| ID | Tính năng / giá trị | Bản đầu và tiêu chí nghiệm thu | Nền tảng / phụ thuộc |
|---|---|---|---|
| FREE-01 | **Lịch sự kiện theo danh mục/watchlist:** biết mã mình quan tâm sắp có việc gì | Lịch tuần/tháng, lọc mã, xem ngày GDKHQ/thanh toán/họp nếu nguồn có; chọn nhắc trước. Hiển thị nguồn, ngày cập nhật và trạng thái chưa xác nhận; sự kiện đổi ngày không để lại nhắc cũ/trùng | Mở rộng corporateEvents, watchlist và thông báo hiện có; kiểm tra độ phủ ngày tương lai trước khi cam kết hỗ trợ từng loại sự kiện |
| FREE-02 | **So sánh 2–4 cổ phiếu:** xem khác biệt trên cùng màn hình | Giá, hiệu suất cùng kỳ, P/E, P/B, tăng trưởng và cổ tức khi đủ dữ liệu; biểu đồ chuẩn hóa cùng mốc; thêm watchlist từ bảng. Chỉ tiêu khác kỳ phải ghi rõ, thiếu dữ liệu không điền 0; dùng được trên điện thoại | Tận dụng trang chi tiết và fundamentals; đây là màn hình so sánh có số liệu xác định, mở rộng từ câu hỏi so sánh trong chat |
| FREE-03 | **Bộ lọc cổ phiếu có thể lưu:** tìm lại nhóm mã đúng tiêu chí | Lọc theo giá, thanh khoản và chỉ tiêu cơ bản đã có; lưu/sửa/xóa bộ lọc; ghi lý do mã khớp. Công bố tập mã được quét, kỳ số liệu, nguồn và phần chưa có dữ liệu; không gọi là toàn thị trường nếu chỉ tải một tập con | Bảng giá hiện có chưa phải bộ lọc lưu được. Bắt đầu với tập mã có dữ liệu; đánh giá giới hạn nguồn trước khi quét rộng |

Ba tính năng này có thể được thiết kế/triển khai trong lúc sửa N1–N6. Chỉ phần so sánh hiệu suất phụ thuộc phép tính đang lỗi mới phải chờ bản sửa tương ứng trước khi phát hành.

### Đợt B — Giúp người dùng hiểu danh mục và thử phương án

| ID | Tính năng / giá trị | Bản đầu và tiêu chí nghiệm thu | Nền tảng / phụ thuộc |
|---|---|---|---|
| FREE-04 | **Lịch thu nhập đầu tư:** biết đã nhận bao nhiêu và dự kiến còn gì | Tách cổ tức thực nhận theo tháng với khoản dự kiến; dự kiến ghi căn cứ số lượng đủ điều kiện, mức cổ tức, thuế/giả định và độ chắc chắn. Xác nhận nhận tiền phải chống ghi trùng; lịch dự kiến không tự tăng tiền mặt | Hiện có tổng cổ tức và sự kiện quyền; phần mới là lịch dòng tiền thực nhận/dự kiến. Phụ thuộc sổ, nguồn sự kiện và sửa N1/N2 |
| FREE-05 | **Mô phỏng biến động danh mục:** thấy ảnh hưởng nếu thị trường thay đổi | Người dùng đặt kịch bản như cổ phiếu -10%, vàng +5%, tỷ giá +2%; xem tổng tài sản và đóng góp từng nhóm trước/sau. Không ghi vào sổ; thiếu giá phải có nhãn; không tính tỷ giá hai lần | Khác mô phỏng mức góp/lợi suất mục tiêu hiện có: tính tác động lên tài sản đang giữ. Phép tính bằng code, giả định do người dùng chọn |
| FREE-06 | **Mô phỏng tái cân bằng:** xem cách tiến gần tỷ trọng mong muốn | Nhập tỷ trọng và tiền bổ sung; phương án chỉ dùng tiền mới hoặc cho phép bán; hiển thị lượng, phí giả định, tiền dư, tỷ trọng sau điều chỉnh. Không tạo giao dịch thật; tổng tỷ trọng, đơn vị/lô và tiền phải hợp lệ | Mở rộng từ phân bổ/mục tiêu hiện có; cần định giá và N5 ổn định. Đây là công cụ tính theo lựa chọn người dùng |
| FREE-07 | **Danh mục luyện tập:** học qua giao dịch giả lập | Tài khoản tiền ảo riêng, mua/bán giả lập, phí và quy tắc khớp mô phỏng rõ; lịch sử, reset, thống kê. Dữ liệu luyện tập không vào danh mục thật, mục tiêu thật hoặc chỉ số kích hoạt thật | Demo hiện có là trải nghiệm mẫu; phần mới cho phép người dùng tự thao tác và lưu danh mục luyện tập |

### Đợt C — Giúp người dùng theo dõi quyết định và nhận thông tin đúng lúc

| ID | Tính năng / giá trị | Bản đầu và tiêu chí nghiệm thu | Nền tảng / phụ thuộc |
|---|---|---|---|
| FREE-08 | **Nhật ký quyết định và tổng kết thói quen:** biết mình làm đúng kế hoạch đến đâu | Thêm nhãn lý do/cảm xúc, liên kết giao dịch và kế hoạch; tổng kết theo tháng những lần giữ/đổi kế hoạch và lý do. Phân biệt tuân thủ kế hoạch với kết quả lãi/lỗ; không suy ra giao dịch đã thực hiện từ chat | Mở rộng kế hoạch, phiên bản và review đã có; không xây lại một hệ thống nhật ký độc lập |
| FREE-09 | **Cảnh báo theo tình trạng danh mục:** nhận tin khi vấn đề thực sự liên quan | Người dùng đặt ngưỡng tập trung, lệch tỷ trọng hoặc giảm tài sản sau loại dòng vốn; xem trước lý do, bật/tắt riêng, giới hạn tần suất. Chỉ kích hoạt khi dữ liệu đủ tin cậy; mất giá không tạo cảnh báo lỗ giả | Tận dụng reviewPoints và notification; khác cảnh báo giá một mã hiện có. Phụ thuộc sửa phép tính liên quan và nghiệm thu kênh gửi |
| FREE-10 | **Báo cáo tháng có thể tải/chia sẻ:** dễ nhìn lại và trao đổi về danh mục | Xuất PDF/CSV theo kỳ: dòng vốn, lợi nhuận, phí, cổ tức, phân bổ và ghi chú chất lượng. Có xem trước, tùy chọn ẩn số tiền/mã; số liệu khớp màn hình. Bản đầu là file tải xuống, chưa cần link công khai | Tận dụng lịch sử và sổ; phụ thuộc kết quả tính toán đã kiểm chứng. Không tự chia sẻ danh mục người dùng |

### Cách triển khai và đo kết quả

- Bắt đầu với FREE-01, FREE-02, FREE-03 để có thêm lý do mở app hằng ngày; đợt sau mở rộng khả năng quản lý và thử phương án.
- Mỗi ticket cần một luồng đầu-cuối dùng được trên điện thoại, trạng thái rỗng/lỗi/thiếu dữ liệu, ownership và bằng chứng nghiệm thu phù hợp.
- Theo dõi: người dùng tạo bộ lọc rồi quay lại dùng, thêm mã sau so sánh, xem/nhắc sự kiện, lưu kịch bản và xem lại kế hoạch. Tách dữ liệu thật, demo, luyện tập và tác vụ tự động.
- D7/D30, phản hồi người dùng và thời gian tới thao tác hữu ích đầu tiên giúp đánh giá sản phẩm; không lấy số tính năng hoặc số lượt gọi AI làm thước đo duy nhất.
- Phần tính toán, lọc, lịch và bảng so sánh dùng logic xác định. AI bổ sung diễn giải khi có ích; nguồn dữ liệu và số liệu tính sẵn vẫn phải truy được.

## Phụ lục — Review lịch sử ngày 20/10/2026

<details>
<summary>Mở kết quả cũ tại nền commit 0931211 — không dùng làm trạng thái hiện tại</summary>

- Bản ghi lịch sử: working tree ngày 20/10, nền commit 0931211, gồm thay đổi frontend chưa commit.
- Các tỷ lệ 60–65%/63%, 122 unit test, lỗi R1–R7 và việc giao dev trong phần này chỉ phản ánh thời điểm đó.
- Bản review cũ ghi nhận đã tái hiện R1/R4/preview trên PostgreSQL tạm dautu_review và xóa DB sau kiểm tra. Đây là bằng chứng lịch sử, không phải lần chạy lại cho f42c4a5.
- Các số dòng source và tham chiếu “mục 4” trong bản cũ ứng với phiên bản lịch sử; xem H4 bên dưới. Trạng thái hiện tại và việc cần làm nằm ở mục 1–6 phía trên.

### H1. Kết luận và cách tính

**Ước tính hoàn thành khoảng 60–65% toàn bộ backlog theo tiêu chí nghiệm thu.**

Nếu chỉ đếm hạng mục có phần triển khai đáng kể, hiện có **12/15, tương đương 80%**. Tuy nhiên, một số luồng đã có giao diện và backend vẫn chưa đạt đủ tiêu chí nghiệm thu hoặc có lỗi nghiệp vụ.

Cách chấm:

- Mỗi hạng mục có trọng số bằng nhau vì backlog chưa có estimate công sức.
- Điểm là ước lượng kỹ thuật theo phạm vi, tiêu chí nghiệm thu, mã nguồn và bằng chứng kiểm tra, làm tròn theo bước 5%.
- Không dùng số dòng code hoặc trạng thái “Đã làm” trong docs để thay thế việc đối chiếu.
- Tổng điểm bảng dưới là 945/1.500, tức 63%; nên dùng khoảng 60–65% thay vì coi 63% là một phép đo chính xác tuyệt đối.
- Đây không phải tỷ lệ thời gian/công sức đã tiêu tốn, tỷ lệ test coverage hoặc xác suất sản phẩm hoạt động đúng.
- Với BIZ-01, chỉ đánh giá bằng chứng có trong repository; nghiên cứu kinh doanh có thể tồn tại bên ngoài repo.

### H2. Bảng đối chiếu 15 hạng mục

| ID | Ước tính | Đã có trong source | Phần còn thiếu hoặc chưa đạt |
|---|---:|---|---|
| DATA-01 | 85% | Trạng thái fresh/stale/fallback/missing; phần chưa có giá tách riêng; nguồn/thời điểm; cảnh báo và unit test | Lịch sử làm mất trạng thái stale/fallback của giá hiện tại; cờ ước tính chưa nhất quán ở báo cáo kỳ |
| OBS-01 | 0% | Chưa thấy hệ thống đo hành vi theo yêu cầu | Từ điển sự kiện, kích hoạt, D7/D30, đo bản tin/kế hoạch và báo cáo sử dụng |
| AI-01 | 10% | Model brief/fast, giới hạn vòng gọi công cụ, hủy stream, xử lý lỗi cơ bản | Usage/chi phí theo người dùng, quota server, ngân sách, giới hạn đồng thời, lịch sử chat dài, hàng đợi tạo bản tin bền vững |
| QA-01 | 70% | CI build/test/lint; 122 unit test; có bộ Playwright kiểm tra mobile; migration chạy sạch trên DB trống | Thiếu kiểm tra tích hợp các ranh giới DB/đồng thời (R1, R4 lọt qua toàn bộ unit test); mobile audit ghi lỗi nhưng chưa fail theo lỗi tìm được; chưa tách bundle/đo tải trang thực |
| WL-01 | 95% | Quản lý stock/crypto/gold; chuẩn hóa mã, quyền sở hữu, unique, giá, liên kết/cảnh báo và test service | Cần nghiệm thu luồng thật và giới hạn số mã khi thêm đồng thời |
| ACQ-01 | 60% | `/demo` công khai, nhãn dữ liệu mẫu, dữ liệu tách biệt, không gọi AI; có `next` khi đăng nhập | Vẫn bắt khảo sát với tài khoản chưa onboarded; mất ngữ cảnh sau onboarding/chuyển sang đăng ký; chưa có analytics |
| PF-01 | 85% | Sổ Decimal, bình quân giá vốn, mua/bán/nạp/rút/phí/cổ tức, revisions, soft-delete, khóa ghi theo người dùng, migration, đối soát | Cần kiểm thử tích hợp migration/rollback/ghi đồng thời; xác thực ngày nhập tay còn yếu; cần chốt và làm rõ quy ước lãi crypto quy VND |
| PF-02 | 80% | CSV mẫu, mapping, preview, lỗi dòng, chọn nghi trùng, tác động, batch và undo | Retry tạo thêm giao dịch khi giữ dòng nghi trùng (đã xác nhận trên PostgreSQL); preview tạo danh mục/chuyển holding cũ (đã xác nhận) |
| PF-03 | 65% | Lịch sử dựng lại từ sổ, giá theo ngày, Modified Dietz, ghi chú dữ liệu thiếu và test tính toán | Có trường hợp mất nhãn ước tính ở giá đầu kỳ; giá hiện tại stale/fallback vẫn có thể được coi đầy đủ; chưa kiểm chứng toàn luồng nguồn giá |
| HOME-01 | 75% | Trang cá nhân, tin liên quan, điểm cần xem lại, bản tin, trạng thái rỗng; các khối tải độc lập | Tăng/giảm và đóng góp trong ngày vẫn giả định giữ nguyên số lượng cả ngày, chưa sử dụng sổ giao dịch |
| BRIEF-01 | 65% | Cron tuần, bảng số xác định, AI diễn giải, bật/tắt, hội thoại hỏi tiếp, test bảng | Chống trùng conversation chưa nguyên tử; chưa đo lượt mở/hành động; narrative AI chưa có kiểm tra tự động đối chiếu số |
| PLAN-01 | 90% | Nháp AI cần bấm lưu, phiên bản trước, reviews, nhắc hạn, giao dịch cùng mã và giá hiện tại | Cần test service/quyền sở hữu và ghi đồng thời; liên kết giao dịch theo mã chưa phân biệt một giao dịch thuộc kế hoạch nào khi có nhiều kế hoạch lịch sử |
| NT-01 | 85% | Telegram và Web Push, opt-in, giờ yên lặng, loại tin, mặc định riêng tư, queue/retry/trạng thái và test quy tắc | Chưa kiểm thử gửi thật; notification và delivery chưa tạo nguyên tử; cần kiểm thử crash/retry và tránh mất việc gửi |
| GOAL-01 | 80% | Gán tài sản, kiểm tra tổng %, tiến độ, tỷ trọng, mô phỏng có nhãn, pause và test toán học | Hai request đồng thời cùng qua kiểm tra rồi phân bổ quá 100% (19/20 lần trên PostgreSQL); chưa có test service/DB |
| BIZ-01 | 0% | Có giả thuyết gói trong docs | Chưa thấy bằng chứng phỏng vấn, mức sẵn sàng trả tiền, unit economics, giá và tiêu chí thử nghiệm |

Không trừ điểm PF-03 vì thiếu TWR/XIRR/benchmark: các phần đó được ghi rõ là mở rộng sau trong backlog.

Đã có thêm nhiều danh mục, PWA và Web Push vượt phạm vi tối thiểu ban đầu. Những phần này có giá trị, nhưng không thay thế các tiêu chí còn thiếu của OBS-01, AI-01 hay báo cáo lợi nhuận.

### H3. Các phát hiện ưu tiên sửa

#### R1 — PF-02: retry một yêu cầu CSV có thể tạo giao dịch trùng

**Mức độ:** cao. **Bằng chứng:** tái hiện lần đầu với `ImportService` và `TransactionsService.normalize` thật, dùng lưu trữ giả trong bộ nhớ. Đã xác nhận lại trên PostgreSQL thật qua `ImportService.commit` → `TransactionsService.commitImport`, có advisory lock và transaction DB như production; chỉ thay `MarketService` bằng bản giả vì giao dịch nạp tiền không cần nguồn giá.

Các bước:

1. File có hai dòng nạp cùng ngày, cùng số tiền 1.000.000 VND.
2. Người dùng chọn giữ dòng thứ hai đang bị đánh dấu nghi trùng (`includeDuplicates: [3]`).
3. Lần đầu nhập hai giao dịch.
4. Gửi lại nguyên yêu cầu: dòng đầu bị loại vì đã tồn tại, dòng thứ hai vẫn được giữ.
5. Hash được tính từ tập dòng sau lọc nên thay đổi; lần retry nhập thêm một giao dịch.

Kết quả quan sát trên PostgreSQL: tổng giao dịch từ **2 thành 3**, có **2 bản ghi `ImportBatch`**. Lần retry trả `alreadyImported: false`, `imported: 1`, `skippedDuplicates: 1`. Advisory lock không giúp được trường hợp này: hash đã khác trước khi vào vùng khoá, và `ImportBatch.hash` chỉ có index, không có ràng buộc unique.

Nguồn: [import.service.ts](../backend/src/portfolio/import.service.ts), phần `commit`, lọc nghi trùng và tính `hash` tại dòng 92, 179–238; [transactions.ts](../backend/src/portfolio/transactions.ts), `commitImport`.

**Yêu cầu sửa:** nhận diện một thao tác nhập ổn định trước khi lọc lại theo trạng thái DB; retry cùng thao tác phải trả lại kết quả cũ. Bổ sung regression test đúng trường hợp người dùng giữ dòng nghi trùng.

Ngoài ra, preview gọi `resolvePortfolio` và `activeTransactions`; các hàm này có thể tạo danh mục mặc định hoặc chuyển holding cũ sang opening. Đã xác nhận trên PostgreSQL: với tài khoản có 1 holding, chưa có danh mục và giao dịch, **chỉ gọi preview** đã tạo **1 danh mục và 1 giao dịch opening**. Việc này đi ngoài `write` nên không có advisory lock. Vì vậy tiêu chí “preview không ghi gì” chưa đạt. Dữ liệu được ghi trùng với lúc tài khoản tự chuyển đổi, nên mức ảnh hưởng thấp hơn R1, nhưng comment `xem trước (không ghi gì)` trong code đang mô tả sai hành vi.

#### R2 — HOME-01: tăng/giảm hôm nay chưa phản ánh giao dịch trong ngày

**Mức độ:** cao về tính đúng nghiệp vụ. **Bằng chứng:** tái hiện trực tiếp bằng hàm `dayChange`.

Ví dụ:

- Giá tham chiếu 10.000 VND; giá hiện tại 11.000 VND, tăng 10%.
- Người dùng vừa mua 100 cổ phiếu ở 11.000 VND và giá chưa đổi.
- Hàm trả đóng góp tăng khoảng **100.000 VND**; phần tăng giá thực từ sau khi người dùng mua là **0 VND** trong ví dụ chưa có phí.

Code có ghi chú giả định số lượng không đổi, nên đây không phải số liệu hoàn toàn không được giải thích. Tuy nhiên vẫn chưa đạt tiêu chí backlog “có xử lý tiền nạp/rút và giao dịch trong kỳ”.

Nguồn: [today.ts](../backend/src/home/today.ts), dòng 20–63; [home.module.ts](../backend/src/home/home.module.ts), `today`.

**Yêu cầu sửa:** tính theo vị thế đầu kỳ và giao dịch trong ngày; thể hiện riêng biến động giá tham chiếu và hiệu quả của người dùng; có test mua mới, bán một phần, bán hết, phí và nạp/rút.

#### R3 — PF-03/DATA-01: kết quả chưa chắc chắn có thể bị đánh dấu như đầy đủ

**Mức độ:** cao. **Bằng chứng:** tái hiện trực tiếp bằng `buildHistory` và `periodPerformance`.

Ví dụ:

- Opening 100 cổ phiếu, giá vốn 10.000 VND.
- Ngày khai báo chưa có giá thị trường; ngày sau có giá 11.000 VND.
- Hai điểm lịch sử lần lượt có trạng thái `partial`, `complete`.
- Báo cáo trả lợi nhuận kỳ 100.000 VND và **`isEstimate: false`**, dù chưa có giá ngày opening để tách phần lãi đã có trước khi theo dõi.

Nguyên nhân: với danh mục bắt đầu trong kỳ, baseline giả lập mang trạng thái `complete`; cờ ước tính cuối cùng chỉ xét baseline và điểm cuối.

Nguồn: [history.ts](../backend/src/portfolio/history.ts), `buildHistory`, `periodPerformance`, đặc biệt dòng 185.

Có thêm một đường mất thông tin chất lượng dữ liệu: [history.service.ts](../backend/src/portfolio/history.service.ts), dòng 140–158, dùng giá hôm nay và tỷ giá hôm nay nhưng không bảo toàn đầy đủ trạng thái stale/fallback; giá có giá trị luôn được trả `estimated: false`.

**Yêu cầu sửa:** truyền trạng thái chất lượng tới kết quả kỳ, đặc biệt ở mốc xác định số dư/dòng tiền đầu kỳ; không trình bày tỷ suất như chính xác khi thiếu đầu vào thiết yếu.

#### R4 — GOAL-01: hai thao tác đồng thời có thể gán quá 100% tài sản

**Mức độ:** cao. **Bằng chứng:** tái hiện lần đầu bằng `GoalsService` thật với Prisma giả trong bộ nhớ. Đã xác nhận lại bằng `GoalsService.create` trên PostgreSQL thật.

Gửi đồng thời hai yêu cầu tạo mục tiêu, mỗi yêu cầu dùng 60% cùng tài sản. Cả hai đọc phân bổ hiện tại trước khi bản ghi còn lại được tạo và đều qua `validate`. Kết quả quan sát: **hai mục tiêu được tạo, tổng phân bổ 120%**.

Trên PostgreSQL, **19/20 lần thử** (mỗi lần một tài khoản mới) cho tổng phân bổ vượt 100%. Lần còn lại có một yêu cầu bị từ chối đúng. Ở lần đối chứng gửi tuần tự, yêu cầu thứ hai bị chặn đúng với thông báo “FPT đã gán 60% cho mục tiêu khác, chỉ còn 40%”. Vậy quy tắc nghiệp vụ đúng, chỉ thiếu tuần tự hoá.

Nguồn: [goals.module.ts](../backend/src/goals/goals.module.ts), dòng 135–151; kiểm tra nằm ngoài thao tác ghi được bảo vệ.

**Yêu cầu sửa:** kiểm tra và ghi phân bổ trong cùng cơ chế tuần tự hóa theo người dùng; thêm test cạnh tranh ở DB thật. Cả tạo mới và sửa mục tiêu phải giữ tổng phần tài sản không vượt 100%.

#### R5 — BRIEF-01: chống trùng thông báo chưa bảo đảm không trùng bản tin

**Mức độ:** trung bình. **Bằng chứng:** phân tích mã nguồn, chưa mô phỏng crash với DB.

`generate` kiểm tra notification tồn tại, tạo conversation, rồi mới gửi notification có dedupe key. Hai process chạy đồng thời hoặc lỗi giữa tạo conversation và ghi notification có thể tạo nhiều conversation cho cùng kỳ dù notification được chống trùng.

Nguồn: [weekly.service.ts](../backend/src/alerts/weekly.service.ts), dòng 71–74 và phần tạo conversation trước `notifier.send`.

**Yêu cầu sửa:** một kỳ/người dùng có nhận diện duy nhất ở cấp bản tin, có khả năng tiếp tục sau lỗi. Thêm test hai worker cùng xử lý và restart giữa các bước.

#### R6 — NT-01: có thể lưu notification nhưng mất tác vụ gửi ngoài app

**Mức độ:** trung bình. **Bằng chứng:** phân tích mã nguồn.

Notification và bản ghi Telegram/Web Push delivery được tạo tách rời; lỗi tạo delivery bị bỏ qua. Khi retry cùng dedupe key, notification cũ chặn việc chạy tiếp, nên chưa bảo đảm tạo lại delivery bị thiếu.

Nguồn: [notifier.service.ts](../backend/src/alerts/notifier.service.ts), `send`.

**Yêu cầu sửa:** ghi thông báo và ý định gửi bền vững trong cùng transaction hoặc có cơ chế đối soát/bù hàng đợi. Thêm test lỗi DB ở bước tạo delivery.

#### R7 — ACQ-01/QA-01: còn thiếu một số tiêu chí trải nghiệm và kiểm tra

- [App.tsx](../frontend/src/App.tsx), dòng 41 vẫn chuyển mọi tài khoản chưa onboarded sang khảo sát.
- [OnboardingPage.tsx](../frontend/src/pages/OnboardingPage.tsx), `finish` chuyển về `/`, chưa phục hồi đích ban đầu.
- [AuthPage.tsx](../frontend/src/pages/AuthPage.tsx) có hỗ trợ `next`, nhưng liên kết chuyển login/register chưa giữ tham số.
- [mobile.spec.ts](../frontend/e2e/mobile.spec.ts), dòng 85–86 thu thập lỗi và chụp ảnh; chưa có assertion thất bại dựa trên các lỗi audit/JavaScript tìm được. Đã xác nhận khi chạy: audit ghi nhận vùng bấm nhỏ hơn 32px ở `/login` (54×17) và `/register` (72×17), nhưng cả 3 test khách vẫn **passed**.
- Chưa thấy từ điển sự kiện, phát sự kiện kích hoạt, D7/D30 hoặc đo việc mở bản tin.

### H4. Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| `npm run build --prefix frontend` | Đạt; bundle 1.323,61 kB minified, 414,06 kB gzip; vẫn cảnh báo chunk >500 kB |
| `npm run build --prefix backend` | Đạt |
| `npm run lint` | Đạt frontend (`--max-warnings 0`) và backend |
| Unit test backend | `npm test` ở thư mục gốc (`jest --ci`): **14 suites, 122/122 test đạt**, mã thoát 0 |
| `prisma migrate deploy` trên DB trống | Đạt: 14 migration, từ `20261017092605_init` tới `20261020095858_portfolios`, áp dụng không lỗi |
| Tái hiện R1 — PostgreSQL | Thất bại nghiệp vụ: retry CSV tăng giao dịch từ 2 lên 3, tạo 2 đợt nhập |
| Tái hiện preview CSV — PostgreSQL | Thất bại nghiệm thu: chỉ gọi preview đã tạo 1 danh mục và 1 giao dịch opening |
| Tái hiện R2 | Thất bại nghiệm thu: `dayChange` tính 100.000 VND theo giả định nắm giữ từ đầu ngày |
| Tái hiện R3 | Thất bại nghiệm thu: thiếu giá opening nhưng báo cáo kỳ trả `isEstimate: false` |
| Tái hiện R4 — PostgreSQL | Thất bại nghiệm thu: 19/20 lần gửi đồng thời phân bổ 120% cùng tài sản; gửi tuần tự bị chặn đúng |
| Playwright mobile, trang khách | 3/3 passed (`login`, `register`, `demo`, WebKit iPhone 11 Pro) trên app local cổng 3999; audit vẫn ghi 2 lỗi vùng bấm nhỏ mà không làm test thất bại |

Lần chạy `npm test -- --runInBand` đầu tiên trong review kết thúc với mã 139 (SIGSEGV), không có chẩn đoán chi tiết. Các lần chạy sau, gồm Jest `--runInBand --no-cache` và `npm test` ở thư mục gốc, đều đạt. Lỗi này chưa tái hiện lại và chưa rõ nguyên nhân. Nếu CI gặp lại, cần ghi nhận riêng.

Cách dựng các tái hiện:

- R2, R3: gọi hàm thuần từ bản build local với dữ liệu tổng hợp.
- R1, R4, preview: gọi service thật từ `backend/dist` với `PrismaService` thật, nối vào database tạm `dautu_review` trong container `dautu-postgres` local. DB này chỉ dựng từ migration, không chứa dữ liệu người dùng. Mỗi kịch bản dùng tài khoản tổng hợp riêng. Database được xoá sau khi kiểm tra.
- Playwright chỉ chạy 3 kịch bản khách vì không dùng JWT của tài khoản thật. Thư mục `frontend/e2e-results` đã được khôi phục về kết quả audit trước đó.

Còn chưa kiểm tra:

- Migration nâng cấp trên bản sao dữ liệu thật, rollback và đối soát số dư sau migration.
- Playwright cho các trang cần đăng nhập.
- Gửi Telegram/Web Push thật, gọi AI live.
- R5/R6 với crash giữa các bước.
- Production.

Working tree có thay đổi frontend phát sinh trong lúc review. Build, lint và Playwright ở lượt bổ sung chạy trên working tree tại thời điểm đó, nền commit `0931211`. Backend không có thay đổi chưa commit, nên các tái hiện R1–R4 ứng với commit `0931211`.

### H5. Việc nên giao dev tiếp theo

1. Sửa R1, R2, R3, R4 và thêm regression test cho các trường hợp đã tái hiện.
2. Hoàn thiện AI-01: usage, quota và ngân sách phía server trước khi mở rộng lượng người dùng.
3. Triển khai OBS-01 để có số liệu kích hoạt, giữ chân và hiệu quả bản tin.
4. Hoàn thiện chống trùng bản tin, độ bền hàng đợi thông báo và kiểm thử tích hợp.
5. Hoàn thiện onboarding theo ngữ cảnh, cho mobile audit fail với lỗi quan trọng, đo tải trang và tách bundle nếu số đo xác nhận cần thiết.
6. Chỉ chốt BIZ-01 sau khi có dữ liệu sử dụng và chi phí; chưa coi thiếu module thanh toán là lý do duy nhất của 0% hạng mục này.

Nên đổi trạng thái chung “Đã làm” trong backlog thành các mức: “Đã có code”, “Đã qua unit test”, “Đã nghiệm thu luồng thật”. Bản review này giữ nguyên tài liệu gốc để đội dự án tự cập nhật theo bằng chứng nghiệm thu.

</details>
