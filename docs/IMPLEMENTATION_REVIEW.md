# Review mức hoàn thành so với backlog

- Ngày review: 20/10/2026.
- Phạm vi: working tree hiện tại, nền commit `0931211`, gồm cả thay đổi frontend chưa commit.
- Đối chiếu: [DEV_BACKLOG.md](DEV_BACKLOG.md) và [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md).
- Đây là đánh giá mã nguồn và kiểm tra local, không phải xác nhận nghiệm thu production.
- Review không sửa logic ứng dụng. Các thay đổi source chưa commit là thay đổi có sẵn hoặc phát sinh ngoài lần review này.
- Lượt xác minh bổ sung cùng ngày: R1, R4 và tình huống preview CSV ghi dữ liệu đã được chạy lại trên PostgreSQL thật, dùng database tạm `dautu_review` dựng từ migration và xoá sau khi kiểm tra. Lượt này cũng chạy lại build/lint/test và Playwright cho các trang khách. Chi tiết ở mục 4.

## 0. Cập nhật sau khi sửa (21/10/2026)

Các mục 1–5 bên dưới giữ nguyên kết quả review ngày 20/10/2026 (trước khi sửa). Bảng này ghi trạng thái sau khi xử lý; mọi thay đổi đã deploy lên production qua CI (build, unit test, test tích hợp PostgreSQL, lint) và health check đạt.

| Vấn đề | Trạng thái | Commit | Bằng chứng |
|---|---|---|---|
| R1 — retry CSV tạo trùng; preview ghi DB | Đã sửa | `0b8fcfb` | Test tích hợp PostgreSQL: retry giữ dòng nghi trùng vẫn 2 giao dịch, gửi đồng thời ghi một lần, preview không tạo danh mục / giao dịch |
| R2 — tăng/giảm hôm nay chưa xét giao dịch trong ngày | Đã sửa | `0192beb` | Unit test: mua mới ở giá hiện tại = 0, phí, mua thêm, bán một phần, bán hết, nạp tiền, khai báo hôm nay |
| R3 — thiếu giá đầu kỳ nhưng `isEstimate: false` | Đã sửa | `55d6205`, `c8ace7a` | Unit test thiếu giá / giá cũ / tỷ giá ước tính ngày khai báo; lịch sử dùng giá đóng cửa gốc (VNDirect), nguồn lỗi thì đánh dấu ước tính |
| R4 — mục tiêu phân bổ quá 100% khi đồng thời | Đã sửa | `e2ccde5` | Test tích hợp: tạo / sửa đồng thời không vượt 100% |
| R5 — bản tin trùng khi chạy chồng / lỗi giữa chừng | Đã sửa | `98d3e90`, `fa4d056` | `BriefRun` duy nhất theo người / kỳ, hàng đợi `BriefJob` (SKIP LOCKED, retry, nhận lại việc dở); test tích hợp |
| R6 — thông báo lưu nhưng mất việc gửi | Đã sửa | `43caadd`, `9dd0f00` | Lưu cùng transaction; test giao thức Telegram / Web Push với server giả, payload Web Push giải mã thật |
| R7 — onboarding, mobile audit không fail | Đã sửa | `3fa362b`, `06fc0aa`, `9d9872a` | Khảo sát có "Để sau", giữ trang đích; audit fail theo lỗi; 44/44 màn hình đạt kể cả trang cần đăng nhập |
| OBS-01 | Đã làm | `31122f1`, `5dde0e9` | Bảng `AnalyticsEvent`, báo cáo kích hoạt, D7/D30, bản tin, thời gian tới giá trị đầu tiên, duy trì nhật ký, chất lượng dữ liệu / AI; đang ghi sự kiện thật trên production |
| AI-01 | Đã làm | `c2ba575`, `fa4d056`, `ad75127`, `419ed3f` | Usage + chi phí theo bảng giá có phiên bản (`AI_PRICES` đã khai trên production), quota và ngân sách kiểm tra nguyên tử, hàng đợi bản tin, test luồng chat (hết quota, huỷ, lỗi model, lịch sử dài) |
| QA-01 | Đã làm | `ab99be8`, `5f83bd1`, `78b0f5a` | Test tích hợp trong CI, tách bundle + nén sẵn (trang đăng nhập 7,1 s → 1,5 s trên mạng chậm giả lập), mẫu PR, tài liệu kiểm thử, sao lưu DB trước mỗi migration |
| PF-01 — sự kiện quyền chưa hỗ trợ | Đã làm | `c8ace7a`, `85f776a` | Loại giao dịch nhận cổ phiếu (thưởng / chia tách), phát hiện sự kiện chưa ghi theo Vietcap (kiểm thật: FPT thưởng 10% ngày 21/09/2026); ngày nhập phải có thật; đối soát production "Khớp" |
| DATA-01 — lãi crypto quy VND | Đã làm | `e30bf8f` | Hai con số: lãi theo USDT và lãi VND thực tế theo tỷ giá lúc mua (tách phần do tỷ giá) |
| BRIEF-01 — kiểm tra số trong nhận định AI | Đã làm | `ecacebd` | Đối chiếu tự động số AI viết với số đã tính; sai thì viết lại một lần, vẫn sai thì bỏ nhận định (tuần) hoặc ghi cảnh báo (sáng / chiều) |
| PLAN-01, WL-01 | Đã làm | `44512a0`, `878de31` | Giao dịch ghi rõ trước / trong / sau kế hoạch; giới hạn watchlist giữ đúng khi đồng thời |
| BIZ-01 | Phần kỹ thuật đã có | `710f1c6` | Chi phí AI mỗi người, quota thực thi được; phỏng vấn, giá, tiêu chí thử nghiệm là việc của product |

Còn lại cần người thật: thử thông báo trên thiết bị thật ([NOTIFICATIONS_TEST.md](NOTIFICATIONS_TEST.md)) và phần product của BIZ-01. TWR/XIRR và benchmark vẫn để sau theo backlog.

## 1. Kết luận và cách tính

**Ước tính hoàn thành khoảng 60–65% toàn bộ backlog theo tiêu chí nghiệm thu.**

Nếu chỉ đếm hạng mục có phần triển khai đáng kể, hiện có **12/15, tương đương 80%**. Tuy nhiên, một số luồng đã có giao diện và backend vẫn chưa đạt đủ tiêu chí nghiệm thu hoặc có lỗi nghiệp vụ.

Cách chấm:

- Mỗi hạng mục có trọng số bằng nhau vì backlog chưa có estimate công sức.
- Điểm là ước lượng kỹ thuật theo phạm vi, tiêu chí nghiệm thu, mã nguồn và bằng chứng kiểm tra, làm tròn theo bước 5%.
- Không dùng số dòng code hoặc trạng thái “Đã làm” trong docs để thay thế việc đối chiếu.
- Tổng điểm bảng dưới là 945/1.500, tức 63%; nên dùng khoảng 60–65% thay vì coi 63% là một phép đo chính xác tuyệt đối.
- Đây không phải tỷ lệ thời gian/công sức đã tiêu tốn, tỷ lệ test coverage hoặc xác suất sản phẩm hoạt động đúng.
- Với BIZ-01, chỉ đánh giá bằng chứng có trong repository; nghiên cứu kinh doanh có thể tồn tại bên ngoài repo.

## 2. Bảng đối chiếu 15 hạng mục

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

## 3. Các phát hiện ưu tiên sửa

### R1 — PF-02: retry một yêu cầu CSV có thể tạo giao dịch trùng

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

### R2 — HOME-01: tăng/giảm hôm nay chưa phản ánh giao dịch trong ngày

**Mức độ:** cao về tính đúng nghiệp vụ. **Bằng chứng:** tái hiện trực tiếp bằng hàm `dayChange`.

Ví dụ:

- Giá tham chiếu 10.000 VND; giá hiện tại 11.000 VND, tăng 10%.
- Người dùng vừa mua 100 cổ phiếu ở 11.000 VND và giá chưa đổi.
- Hàm trả đóng góp tăng khoảng **100.000 VND**; phần tăng giá thực từ sau khi người dùng mua là **0 VND** trong ví dụ chưa có phí.

Code có ghi chú giả định số lượng không đổi, nên đây không phải số liệu hoàn toàn không được giải thích. Tuy nhiên vẫn chưa đạt tiêu chí backlog “có xử lý tiền nạp/rút và giao dịch trong kỳ”.

Nguồn: [today.ts](../backend/src/home/today.ts), dòng 20–63; [home.module.ts](../backend/src/home/home.module.ts), `today`.

**Yêu cầu sửa:** tính theo vị thế đầu kỳ và giao dịch trong ngày; thể hiện riêng biến động giá tham chiếu và hiệu quả của người dùng; có test mua mới, bán một phần, bán hết, phí và nạp/rút.

### R3 — PF-03/DATA-01: kết quả chưa chắc chắn có thể bị đánh dấu như đầy đủ

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

### R4 — GOAL-01: hai thao tác đồng thời có thể gán quá 100% tài sản

**Mức độ:** cao. **Bằng chứng:** tái hiện lần đầu bằng `GoalsService` thật với Prisma giả trong bộ nhớ. Đã xác nhận lại bằng `GoalsService.create` trên PostgreSQL thật.

Gửi đồng thời hai yêu cầu tạo mục tiêu, mỗi yêu cầu dùng 60% cùng tài sản. Cả hai đọc phân bổ hiện tại trước khi bản ghi còn lại được tạo và đều qua `validate`. Kết quả quan sát: **hai mục tiêu được tạo, tổng phân bổ 120%**.

Trên PostgreSQL, **19/20 lần thử** (mỗi lần một tài khoản mới) cho tổng phân bổ vượt 100%. Lần còn lại có một yêu cầu bị từ chối đúng. Ở lần đối chứng gửi tuần tự, yêu cầu thứ hai bị chặn đúng với thông báo “FPT đã gán 60% cho mục tiêu khác, chỉ còn 40%”. Vậy quy tắc nghiệp vụ đúng, chỉ thiếu tuần tự hoá.

Nguồn: [goals.module.ts](../backend/src/goals/goals.module.ts), dòng 135–151; kiểm tra nằm ngoài thao tác ghi được bảo vệ.

**Yêu cầu sửa:** kiểm tra và ghi phân bổ trong cùng cơ chế tuần tự hóa theo người dùng; thêm test cạnh tranh ở DB thật. Cả tạo mới và sửa mục tiêu phải giữ tổng phần tài sản không vượt 100%.

### R5 — BRIEF-01: chống trùng thông báo chưa bảo đảm không trùng bản tin

**Mức độ:** trung bình. **Bằng chứng:** phân tích mã nguồn, chưa mô phỏng crash với DB.

`generate` kiểm tra notification tồn tại, tạo conversation, rồi mới gửi notification có dedupe key. Hai process chạy đồng thời hoặc lỗi giữa tạo conversation và ghi notification có thể tạo nhiều conversation cho cùng kỳ dù notification được chống trùng.

Nguồn: [weekly.service.ts](../backend/src/alerts/weekly.service.ts), dòng 71–74 và phần tạo conversation trước `notifier.send`.

**Yêu cầu sửa:** một kỳ/người dùng có nhận diện duy nhất ở cấp bản tin, có khả năng tiếp tục sau lỗi. Thêm test hai worker cùng xử lý và restart giữa các bước.

### R6 — NT-01: có thể lưu notification nhưng mất tác vụ gửi ngoài app

**Mức độ:** trung bình. **Bằng chứng:** phân tích mã nguồn.

Notification và bản ghi Telegram/Web Push delivery được tạo tách rời; lỗi tạo delivery bị bỏ qua. Khi retry cùng dedupe key, notification cũ chặn việc chạy tiếp, nên chưa bảo đảm tạo lại delivery bị thiếu.

Nguồn: [notifier.service.ts](../backend/src/alerts/notifier.service.ts), `send`.

**Yêu cầu sửa:** ghi thông báo và ý định gửi bền vững trong cùng transaction hoặc có cơ chế đối soát/bù hàng đợi. Thêm test lỗi DB ở bước tạo delivery.

### R7 — ACQ-01/QA-01: còn thiếu một số tiêu chí trải nghiệm và kiểm tra

- [App.tsx](../frontend/src/App.tsx), dòng 41 vẫn chuyển mọi tài khoản chưa onboarded sang khảo sát.
- [OnboardingPage.tsx](../frontend/src/pages/OnboardingPage.tsx), `finish` chuyển về `/`, chưa phục hồi đích ban đầu.
- [AuthPage.tsx](../frontend/src/pages/AuthPage.tsx) có hỗ trợ `next`, nhưng liên kết chuyển login/register chưa giữ tham số.
- [mobile.spec.ts](../frontend/e2e/mobile.spec.ts), dòng 85–86 thu thập lỗi và chụp ảnh; chưa có assertion thất bại dựa trên các lỗi audit/JavaScript tìm được. Đã xác nhận khi chạy: audit ghi nhận vùng bấm nhỏ hơn 32px ở `/login` (54×17) và `/register` (72×17), nhưng cả 3 test khách vẫn **passed**.
- Chưa thấy từ điển sự kiện, phát sự kiện kích hoạt, D7/D30 hoặc đo việc mở bản tin.

## 4. Kiểm tra đã chạy

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

## 5. Việc nên giao dev tiếp theo

1. Sửa R1, R2, R3, R4 và thêm regression test cho các trường hợp đã tái hiện.
2. Hoàn thiện AI-01: usage, quota và ngân sách phía server trước khi mở rộng lượng người dùng.
3. Triển khai OBS-01 để có số liệu kích hoạt, giữ chân và hiệu quả bản tin.
4. Hoàn thiện chống trùng bản tin, độ bền hàng đợi thông báo và kiểm thử tích hợp.
5. Hoàn thiện onboarding theo ngữ cảnh, cho mobile audit fail với lỗi quan trọng, đo tải trang và tách bundle nếu số đo xác nhận cần thiết.
6. Chỉ chốt BIZ-01 sau khi có dữ liệu sử dụng và chi phí; chưa coi thiếu module thanh toán là lý do duy nhất của 0% hạng mục này.

Nên đổi trạng thái chung “Đã làm” trong backlog thành các mức: “Đã có code”, “Đã qua unit test”, “Đã nghiệm thu luồng thật”. Bản review này giữ nguyên tài liệu gốc để đội dự án tự cập nhật theo bằng chứng nghiệm thu.
