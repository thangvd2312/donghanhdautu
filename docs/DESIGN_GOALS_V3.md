# Mục tiêu v3: kế hoạch sống, đưa từng người tới đích của họ

- Ngày: 04/11/2026. Trạng thái: **chủ sản phẩm đã duyệt khung, mockup và các quyết định ở §11 (04/11/2026)**, trừ nguồn dữ liệu cho đợt D.
- Mockup: https://claude.ai/artifact/2MnTQo2TNii6JjQtcyRqEd (6 màn hình điện thoại).
- Nối tiếp: `docs/DESIGN_GOALS_V2.md` (2 kiểu mục tiêu, bảng giả định), `docs/DESIGN_INVEST_PLAN.md` (Kế hoạch giải ngân).

## 0. Vấn đề, mục đích, nguyên tắc

**Vấn đề.** App lập kế hoạch tốt *một lần* nhưng không đồng hành sau đó:
- Mục tiêu, Kế hoạch giải ngân và Kế hoạch từng mã là 3 phần rời. `DeploymentPlan` không có `goalId`, nên sau khi lưu không biết kế hoạch giải ngân phục vụ mục tiêu nào. Kế hoạch mã cũng không thuộc mục tiêu nào.
- Tiến độ mục tiêu dựa vào việc người dùng tự gán % từng tài sản (`GoalAllocation`). Đa số sẽ không làm, nên tiến độ = 0.
- Giải ngân chỉ chọn được *một lần* **hoặc** *mỗi tháng*. Trường hợp phổ biến nhất ("có 100tr, mỗi tháng góp thêm 20–30tr") không làm được.
- Tiền góp tháng này đi đâu: lịch chia đều cố định, không nhìn danh mục đang lệch phần nào, không nhìn thị trường.
- Không có gì phản ứng khi thị trường, lãi suất hay vĩ mô thay đổi, ngoài cảnh báo giá và tin tức chung.

**Mục đích.** Mỗi người đến app với một đích khác nhau (sinh lời đều, mua nhà, con đi học, quỹ dự phòng…). App lập phương án, **theo dõi mỗi ngày**, và chỉ gọi người dùng khi có lý do cụ thể có số liệu và nguồn. App cho thấy đang đúng lộ trình hay chậm, và các cách tới đích sớm hơn kèm cái giá của từng cách.

**Nguyên tắc** (giữ như v2 và Giải ngân):
1. Số tiền, tỷ trọng, ngưỡng do **quy tắc trong code** tính (có test). AI chỉ diễn giải lý do.
2. **Theo dõi mỗi ngày, quyết định khi đủ lý do.** Không khuyên mua bán theo biến động hằng ngày. Ngày bình thường hiện một dòng "Không có gì cần làm".
3. Mọi đề xuất kèm **số liệu và nguồn**. Lệch theo thị trường có **giới hạn** (§6), không bao giờ dồn hết vào một chỗ.
4. Đo **những gì người dùng tự quyết được** (góp đúng lịch, giữ tỷ trọng, mua có lý do). Lợi nhuận chỉ hiện dạng khoảng xấu, trung bình, tốt, và chỉ so theo năm.
5. Dùng dữ liệu đã có (hồ sơ rủi ro, danh mục, sổ giao dịch, các đợt giải ngân) trước khi hỏi thêm.
6. Không tự ghi giao dịch, không đòn bẩy, crypto không tính lợi suất kỳ vọng và không lệch theo thị trường.

## 1. Ví dụ người dùng

| Người | Đích | Tiền | Điều app làm |
|---|---|---|---|
| Anh T | Lãi đều 10–12%/năm | 100tr + 20–30tr/tháng | Tỷ trọng gốc theo bảng v2. Mỗi tháng chia tiền góp vào phần đang thiếu. Thị trường giảm mạnh: "trong mức năm xấu, có thể mua sớm đợt tới" |
| Chị A | Mua nhà 2 tỷ, 06/2030 | 600tr + 15tr/tháng | Cổ phiếu giảm dần khi gần ngày mua. Báo chậm 9 tháng, kèm 4 cách để tới đích sớm hơn |
| Bạn C | Quỹ dự phòng 6 tháng chi tiêu | 5tr/tháng | Chỉ tiền gửi. Ưu tiên nhận tiền góp trước các mục tiêu khác |

## 2. Mô hình mục tiêu

### 2.1 Năm thông số chung

Mọi mục tiêu đều mô tả được bằng: **đích**, **thời hạn** (có hay không, cứng hay mềm), **tiền có và tiền góp**, **mức chịu lỗ**, **hậu quả nếu trượt** (→ mức ưu tiên).

### 2.2 Ba kiểu bên trong, nhiều mẫu bên ngoài

| `kind` | Ý nghĩa | Trạng thái |
|---|---|---|
| `return` | Sinh lời đều X%/năm trên số vốn | Có (v2) |
| `amount` | Có số tiền vào ngày | Có (v2) |
| `safety` | Quỹ dự phòng: N tháng chi tiêu, rút được ngay | **Mới**. Chỉ tiền gửi. Số tiền gợi ý = chi tiêu tháng (đã có trong `DeploymentRequest.emergency`) × số tháng |

Mẫu (`Goal.template`, chỉ để điền sẵn): `house` mua nhà · `car` mua xe · `education` con đi học · `retirement` hưu trí / tự do tài chính · `emergency` → `safety` · `grow` → `return` · `custom`.
Mỗi mẫu điền sẵn: tên, thời hạn gợi ý, thời hạn cứng hay mềm, mức ưu tiên. Người dùng sửa được hết.

### 2.3 Mức ưu tiên (`Goal.priority`)

1 = `safety` · 2 = `amount` có hạn cứng (nhà, học phí) · 3 = `amount` hạn mềm (xe, du lịch) · 4 = `return` / hưu trí.
Dùng để chia tiền góp (§4.3) và để sắp thứ tự trên trang Hôm nay.

## 3. Tỷ trọng gốc và lộ trình theo thời gian

- `return`: thang tỷ trọng và lựa chọn "đạt mức mong muốn" / "trong mức rủi ro" như v2.
- `safety`: 100% tiền gửi.
- `amount`: **giảm cổ phiếu dần khi gần ngày cần tiền** (glide path). Quy tắc đề xuất, mở rộng từ `suggestMix` hiện có:

| Còn lại tới ngày đích | Cổ phiếu (ETF + tự chọn) tối đa | Crypto | Hiện có? |
|---|---|---|---|
| ≥ 7 năm | theo hồ sơ rủi ro | theo hồ sơ | có |
| 3–7 năm | 60% | ≤ 5% | **mới** |
| 1–3 năm | 40% | ≤ 5% | có (`medium_horizon`) |
| < 1 năm | 0%, chỉ tiền gửi kỳ hạn khớp ngày cần tiền | 0 | có (`short_horizon`) |

Tỷ trọng gốc của mục tiêu `amount` được **tính lại mỗi tháng** theo số tháng còn lại. Khi bậc thay đổi (ví dụ từ 3–7 năm sang 1–3 năm), app tạo sự kiện `glide_step` (§5): trước tiên dồn tiền góp sang tiền gửi. Nếu còn dưới 12 tháng mà vẫn dư cổ phiếu, app đề xuất bán phần dư, chia vài đợt.

## 4. Dòng tiền: vốn ban đầu và tiền góp hằng tháng

### 4.1 Giải ngân cả hai cách cùng lúc

`DeploymentPlan` thêm `initialAmount` (một lần) và `monthlyAmount` (mỗi tháng, có thể là khoảng 20–30tr → lưu `monthlyMin` và `monthlyMax`; lịch dùng `monthlyMin`). Giữ `mode` cũ để không phá dữ liệu: `one_time` = chỉ initial, `monthly` = chỉ monthly, `both` mới.

### 4.2 Thẻ "Tháng này góp tiền vào đâu"

Mỗi tháng, vào ngày góp tiền người dùng chọn (mặc định ngày 5), app mở một thẻ cho từng mục tiêu có tiền góp:
1. Người dùng nhập số thật tháng này (điền sẵn mức dự định).
2. Quy tắc chia (hàm thuần `routeContribution`):
   - Tỷ trọng đích của tháng = tỷ trọng gốc (§3), cộng phần lệch theo thị trường nếu có (§6).
   - Giá trị từng phần **sau khi góp** phải gần tỷ trọng đích nhất có thể. Tiền góp đổ vào phần thiếu trước. **Không bán.**
   - Làm tròn theo đơn vị mua tối thiểu như Giải ngân (vàng đủ 1 chỉ, lô cổ phiếu). Phần lẻ dồn vào tiền gửi.
3. Mỗi dòng kèm 1 câu lý do (quy tắc sinh câu mẫu, AI có thể viết lại cho dễ đọc) và nguồn nếu có lệch theo thị trường.
4. Bấm "Đã mua" từng dòng → mở form giao dịch điền sẵn, giao dịch được gắn vào mục tiêu (§7.1). "Bỏ qua" thì ghi lý do.

### 4.3 Nhiều mục tiêu dùng chung tiền góp

Nếu người dùng chỉ nhập **một khoản góp chung** mỗi tháng thì chia theo thứ tự ưu tiên (§2.3):
1. Mỗi mục tiêu có `requiredMonthly`: số cần góp để đạt đích theo lợi suất trung bình của tỷ trọng (đã có `requiredMonthly` trong `goal-math`). Với `return`, dùng mức góp người dùng dự định.
2. Đổ theo ưu tiên 1 → 4, mỗi mục tiêu nhận tối đa `requiredMonthly`. Phần dư đi vào mục tiêu `return`, hoặc chia theo tỷ lệ nếu không có.
3. Thiếu tiền: hiện rõ "Tháng này thiếu 4tr cho mục tiêu Mua nhà", không âm thầm chia ít đi.

## 5. Theo dõi mỗi ngày, gọi người dùng theo sự kiện

### 5.1 Job hằng ngày (worker, sau giờ đóng cửa ~15:30 và 07:00 cho vàng/crypto)

Với mỗi mục tiêu đang chạy: tính tỷ trọng thực, mức sụt giảm từ đỉnh, tiến độ so với lộ trình, rồi chạy bộ quy tắc sự kiện. Kết quả lưu vào `GoalEvent`.

### 5.2 Bảng sự kiện (ngưỡng mặc định, chờ chốt ở §11)

| `kind` | Điều kiện | Dữ liệu | Có sẵn? |
|---|---|---|---|
| `drift` | Một phần lệch ≥ **5 điểm %** so với tỷ trọng đích | danh mục + giá | có |
| `market_drop` | VN-Index giảm ≥ **7%** trong 5 phiên, hoặc BTC giảm ≥ 20% trong 7 ngày | giá chỉ số, Binance | có |
| `drawdown` | Phần tiền của mục tiêu giảm ≥ 70% mức lỗ tối đa đã khai | lịch sử giá trị | có (`PriceDaily`) |
| `policy_rate` | NHNN hoặc Fed đổi lãi suất điều hành | `MacroChange.policy` | có |
| `real_rate` | Lãi tiết kiệm 12 tháng − CPI so với cùng kỳ < 0 | CPI có; lãi tiết kiệm **chưa có nguồn tự động** | một phần |
| `valuation` | P/E VN-Index ở vùng rất rẻ hoặc rất đắt so với 10 năm | **chưa có** | không |
| `gold_premium` | SJC đắt hơn giá thế giới quy đổi > X% | đã có (công cụ vàng của cố vấn) | có |
| `glide_step` | Mục tiêu `amount` chuyển bậc thời gian (§3) | ngày đích | có |
| `off_track` | Dự kiến trung bình trễ hơn ngày đích ≥ 3 tháng (kiểm tra mỗi tháng, không mỗi ngày) | goal-math | có |
| `plan_signal` | Mã trong mục tiêu chạm mốc cắt lỗ / chốt lời / đến hạn xem lại | `planSignals` | có |

### 5.3 Cùng một sự kiện, mỗi mục tiêu phản ứng khác nhau

| Sự kiện | `return` / hưu trí (≥ 7 năm) | `amount` còn 1–3 năm | `amount` < 1 năm / `safety` |
|---|---|---|---|
| `market_drop` | "Trong mức năm xấu đã tính. Không cần bán. Có thể mua sớm đợt tới nếu còn tiền chờ" | "Phần cổ phiếu ≤ 40% như kế hoạch, đừng bán vội. Tiền góp tháng tới ưu tiên tiền gửi" | "Không ảnh hưởng: tiền đã ở tiền gửi". Nếu còn cổ phiếu → cảnh báo rõ |
| `drift` (cổ phiếu tăng mạnh, dư) | Dồn tiền góp vào phần khác; lệch ≥ 10 điểm % thì đề xuất bán bớt | Đề xuất bán phần dư sớm hơn (ngưỡng 5 điểm %) | Đề xuất bán phần dư ngay |
| `policy_rate` / `real_rate` | Giải thích ảnh hưởng; kiểm tra lại khả thi của mục tiêu (§7.3) | Như trái + kiểm tra kỳ hạn tiền gửi | Chỉ thông tin |

### 5.4 Chống làm phiền

- Tối đa 1 thông báo đẩy / mục tiêu / ngày. Sự kiện cùng loại chưa xử lý thì không báo lại.
- Tôn trọng giờ yên lặng (đã có ở Telegram).
- Ngày không có sự kiện: trang Hôm nay hiện "Không có gì cần làm. Các mục tiêu đúng kế hoạch." Tuỳ chọn tóm tắt buổi sáng (§11).
- Mỗi sự kiện có trạng thái `open → done | dismissed`, kèm quyết định và lý do người dùng chọn (như `PlanReview`).

## 6. Lệch theo thị trường (có giới hạn)

Chỉ áp dụng cho **tiền mới** (tiền góp, đợt giải ngân), không tự bán để lệch. Không áp dụng cho mục tiêu còn dưới 3 năm và `safety`.

| Tín hiệu | Quy tắc | Biên |
|---|---|---|
| Định giá VN-Index | P/E ở dưới 30% lịch sử 10 năm → ETF +; trên 80% → ETF −, chuyển sang tiền gửi | ±5 điểm % (mặc định) |
| Lãi thực tiền gửi | Lãi 12 tháng − CPI < 0 → tiền gửi −, chia sang ETF/vàng theo tỷ trọng | ±5 |
| Chênh SJC – thế giới | > X% → mua vàng nhẫn thay SJC; nếu loại nào cũng đắt → vàng − | ±5 |
| Crypto | Không lệch | 0 |

- Tổng lệch của một phần tối đa ±5 (hoặc ±10 nếu chủ sản phẩm chọn). Tổng tỷ trọng vẫn 100.
- Mỗi lần lệch ghi lại tín hiệu, giá trị, nguồn, ngày (`GoalEvent` kind `tilt`).
- **Tự đánh giá sau 12 tháng**: so kết quả có lệch với kết quả nếu giữ tỷ trọng gốc, hiện công khai cho người dùng. Nếu lệch không giúp gì thì nói thẳng.

## 7. Đánh giá mục tiêu

### 7.1 Tiến độ tự động (bỏ bắt buộc gán thủ công)

Thứ tự xác định tài sản nào thuộc mục tiêu nào:
1. Giao dịch gắn mục tiêu (`Transaction.goalId`, mới), hoặc gắn đợt giải ngân (`DeploymentStep.transactionId` đã có) của kế hoạch giải ngân thuộc mục tiêu (`DeploymentPlan.goalId`, mới).
2. Chỉ có 1 mục tiêu đang chạy → mặc định cả danh mục thuộc mục tiêu đó.
3. Gán % thủ công (`GoalAllocation`) giữ lại làm lựa chọn nâng cao, ghi đè 1 và 2.

### 7.2 Đúng lộ trình hay chậm

- **Hành vi** (chính): góp đúng lịch? (x/y tháng) · tỷ trọng lệch bao nhiêu · bao nhiêu lần mua có lý do / đúng kế hoạch.
- **Lộ trình** (phụ, kiểm tra mỗi tháng): đường dự kiến (giá trị lúc bắt đầu + tiền góp, lợi suất trung bình) so với giá trị thực, hiện kèm dải xấu–tốt. Chỉ nói "chậm" khi giá trị thực **dưới dải xấu**, hoặc ngày đạt dự kiến trễ ≥ 3 tháng. Biến động trong dải → "trong dự kiến".
- `return`: lợi suất năm hoá (theo dòng tiền) chỉ hiện sau ≥ 12 tháng. Trước đó hiện "chưa đủ 1 năm để đánh giá".

### 7.3 Kiểm tra khả thi: mỗi quý và khi có sự kiện lớn

Bảng giả định (`RETURN_ASSUMPTIONS`) được xem lại mỗi quý, và ngay khi có `policy_rate` hoặc `real_rate`. Nếu mức trung bình của tỷ trọng hiện tại không còn đạt đích, app hiện các phương án (ví dụ tăng rủi ro, hạ kỳ vọng, giữ nguyên), người dùng chọn, app ghi lại.

### 7.4 Các cách tới đích sớm hơn

Hàm thuần `levers(goal)`, mỗi cách là một ngày đạt dự kiến mới (theo lợi suất trung bình) kèm cái giá:

| Cách | Tính | Cái giá hiện ra |
|---|---|---|
| Góp thêm +X/tháng | `requiredMonthly` cho ngày đích; hoặc ngày mới với +2tr, +5tr | Số tiền góp thêm |
| Tăng rủi ro một bậc | bậc kế trong `ladder` (trong giới hạn §3) | Năm xấu −a% → −b% (và số tiền) |
| Lùi ngày | ngày đạt theo lộ trình hiện tại | Chờ thêm N tháng |
| Hạ đích | số tiền đạt được vào ngày đích | Đích nhỏ hơn |

Tăng rủi ro không được vượt mức lỗ tối đa đã khai. Nếu vượt thì hiện cách đó bị khoá kèm lý do.

## 8. Kế hoạch từng mã trong mục tiêu

- `InvestmentPlan.goalId` (tuỳ chọn) và `budgetVnd`: hạn mức tiền cho mã, mặc định = phần tự chọn của mục tiêu ÷ số mã dự định (tối thiểu 3).
- Giá trị mã vượt hạn mức → tín hiệu `over_budget` trên kế hoạch mã và sự kiện `drift` của mục tiêu.
- Form kế hoạch mã có **điều kiện mẫu** để bấm chọn (ví dụ "Lợi nhuận 2 quý liền giảm", "Giảm 15% so với giá mua", "Lý do mua không còn đúng") cộng AI viết nháp đã có.
- Cửa vào từ mã giữ nguyên: lúc nhập lệnh mua, xem trang cổ phiếu, soi lời khuyên.

## 9. Giao diện

1. **Hôm nay**: khối "Cần làm gì": các sự kiện đang mở, sắp theo ưu tiên mục tiêu, viền trái màu theo mức độ (giống ReviewList). Không có gì → một dòng xanh. Mỗi mục tiêu một dòng: tên, tiến độ, trạng thái ("Đúng kế hoạch" / "Trong dự kiến" / "Chậm 9 tháng").
2. **Mục tiêu** (`/goals`): thẻ mục tiêu v3 = tiến độ + trạng thái lộ trình + việc tiếp theo (đợt góp, sự kiện mở) + tỷ trọng đích vs thực + nút "Cách tới đích sớm hơn".
3. **Thẻ góp tiền tháng** (sheet trên điện thoại, dialog trên desktop): §4.2.
4. **Thẻ sự kiện**: chuyện gì xảy ra (số liệu + nguồn) → ảnh hưởng tới mục tiêu này → việc nên làm (1–2 nút) → "Đã xem, không làm gì" kèm lý do.
5. **Sheet "Cách tới đích sớm hơn"**: §7.4.
6. Mẫu khi tạo mục tiêu: lưới icon (Sinh lời, Mua nhà, Mua xe, Con đi học, Hưu trí, Quỹ dự phòng, Khác).

Mockup duyệt trước khi code; làm theo mockup từng phần (checklist + ảnh chụp so sánh).

## 10. Dữ liệu và API

Migration:
- `Goal`: `template String?`, `priority Int @default(4)`, `kind` thêm `safety`, `contributionDay Int?`, `startedAt DateTime?` (mốc của đường lộ trình).
- `DeploymentPlan`: `goalId String?`, `initialAmount Float?`, `monthlyMin Float?`, `monthlyMax Float?`; `mode` thêm `both`.
- `Transaction`: `goalId String?`.
- `InvestmentPlan`: `goalId String?`, `budgetVnd Float?`.
- Bảng mới `GoalEvent`: `id, goalId, userId, kind, status (open|done|dismissed), payload Json (số liệu + nguồn), decision String?, note String?, createdAt, resolvedAt`; index `(userId, status)`, unique theo `(goalId, kind, key ngày)` để không tạo trùng.
- Bảng mới `MarketSignal` (sau khi có nguồn): `key, value, percentile, asOf, sourceName, sourceUrl`.

API:
- `GET /goals` thêm `track` (hành vi + lộ trình), `events` đang mở, `nextContribution`.
- `POST /goals/:id/contribution/preview` `{ amount }` → các dòng chia tiền (không ghi).
- `POST /goals/:id/contribution` → lưu tháng góp, trả các dòng để ghi giao dịch.
- `GET /goals/:id/levers`.
- `POST /goal-events/:id/resolve` `{ decision, note }`.
- `GET /home/today` thêm khối `todo`.

Hàm thuần (có test): `glideCap`, `routeContribution`, `splitAcrossGoals`, `goalEvents`, `tilt`, `trackStatus`, `levers`.

## 11. Quyết định của chủ sản phẩm (04/11/2026)

1. **Ngưỡng**: dùng mặc định: lệch tỷ trọng 5 điểm %; VN-Index giảm 7% trong 5 phiên; lệch theo thị trường tối đa ±5 điểm %. Chỉnh sau khi dùng thử.
2. **Tóm tắt buổi sáng**: chỉ hiện trên trang Hôm nay, không gửi Telegram / push.
3. **Thanh đáy điện thoại**: Hôm nay · Danh mục · **Mục tiêu** · Cố vấn · Thêm. Kế hoạch mã chuyển vào "Thêm", mở được từ thẻ mục tiêu, trang cổ phiếu, lúc nhập lệnh mua.
4. **Dọn dẹp**: chỉ dọn phần cũ của Mục tiêu: bỏ gán % tài sản bằng tay, "tỷ trọng mong muốn" (`Goal.targetAllocation`), lợi suất tự nhập (`Goal.expectedReturnPct`), "Thử thay đổi mức góp". Thay bằng tiến độ và tỷ trọng tự tính, gắn cả một mã cho một mục tiêu (chỉ khi cần), sheet "Tới đích sớm hơn". Dữ liệu cũ được chuyển sang, không xoá.
   **Giữ nguyên** (không gộp): trang Cảnh báo danh mục, Kế hoạch giải ngân, Tái cân bằng, thanh tỷ trọng tham khảo trên Hôm nay. Hệ quả cho đợt B: sự kiện `drift` / `drawdown` của mục tiêu không được báo trùng với quy tắc cùng loại người dùng đã bật ở Cảnh báo danh mục.
5. **Nguồn dữ liệu** (chưa chốt, cần duyệt trước đợt D, §6):
   - *P/E VN-Index 10 năm*: (a) tự tính từ P/E các mã VN30 đã có (miễn phí, ~8 năm lịch sử theo quý, sai số do tự tính); (b) API chỉ số của Vietcap nếu có (miễn phí, không chính thức, cần kiểm tra); (c) FiinGroup / dữ liệu trả phí (chính xác, tốn tiền).
   - *Lãi tiết kiệm 12 tháng*: (a) cập nhật tay mỗi tháng trong bảng cấu hình, ghi nguồn; (b) lấy tự động từ trang lãi suất của vài ngân hàng lớn (miễn phí, dễ hỏng khi trang đổi).
   - *Giá vàng thế giới*: đã có, không cần thêm.

## 12. Thứ tự làm

| Đợt | Nội dung | Phụ thuộc |
|---|---|---|
| A. Dòng tiền | Mẫu mục tiêu + `safety` + ưu tiên; giải ngân `both`; `goalId` ở giải ngân / giao dịch; tiến độ tự động; thẻ góp tiền tháng; chia tiền cho nhiều mục tiêu; **dọn phần cũ của Mục tiêu (§11.4)** và sheet "Tới đích sớm hơn" thay cho mô phỏng cũ; thanh đáy (§11.3) | — |
| B. Sự kiện | `GoalEvent` + job hằng ngày với dữ liệu đã có (`drift`, `market_drop`, `drawdown`, `policy_rate`, `gold_premium`, `glide_step`, `plan_signal`); khối "Cần làm gì" trên Hôm nay; thông báo | A |
| C. Lộ trình | Glide path 3–7 năm; trạng thái lộ trình; kiểm tra khả thi | A |
| D. Theo thị trường | `MarketSignal` + `valuation`, `real_rate`, lệch có giới hạn; tự đánh giá 12 tháng | nguồn dữ liệu (§11.3) |

## 13. Không làm

- Không khuyên mua bán theo biến động trong ngày, không "tín hiệu" ngắn hạn.
- Không tự đặt lệnh, không tự ghi giao dịch.
- Không đòn bẩy, không altcoin; crypto không tính lợi suất và không lệch theo thị trường.
- Không hứa lợi nhuận: mọi con số tương lai là khoảng theo giả định có nguồn.

## 14. Đợt A: chi tiết kỹ thuật (chốt 04/11/2026)

### 14.1 Tài sản nào thuộc mục tiêu nào (thay §7.1)

Không gán % bằng tay. Gắn theo **giao dịch**: `Transaction.goalId` (tuỳ chọn, FK `Goal`, `onDelete: SetNull`).

Hàm thuần `attributeGoals(transactions, valuation, activeGoals)` (`backend/src/goals/goal-attribution.ts`):
- **Chỉ 1 mục tiêu đang chạy** → toàn bộ danh mục thuộc mục tiêu đó, không cần gắn gì.
- **1 mục tiêu `safety` + 1 mục tiêu khác** (trường hợp hay gặp): tiền mặt chưa gắn lấp quỹ dự phòng trước (tới `targetAmount`), phần còn lại và mọi tài sản khác chưa gắn thuộc mục tiêu kia. Không cần gắn gì.
- **Từ 2 mục tiêu không phải `safety`**: với mỗi mã (`assetType` + `symbol`), số lượng của mục tiêu G = Σ mua/đầu kỳ gắn G − Σ bán gắn G (không âm). Giá trị = số lượng × giá hiện tại (giá vốn nếu thiếu giá, đánh dấu ước tính). Phần số lượng không gắn mục tiêu nào → nhóm **"Chưa thuộc mục tiêu"**.
- Tiền mặt (`cash`): theo dòng tiền đã gắn: nạp − rút − tiền mua + tiền bán (+ cổ tức của phần mã thuộc G), kẹp trong [0, tổng tiền mặt]. Phần còn lại → "Chưa thuộc mục tiêu".
- Gắn tài sản cũ: `POST /goals/:id/assign { assetType, symbol }` gắn **mọi giao dịch chưa gắn** của mã đó (cả nạp/rút tiền khi `assetType = cash`) vào G. Không chia một mã cũ cho nhiều mục tiêu (hiếm; muốn chia thì ghi giao dịch mới có gắn).
- Mỗi mục tiêu ra: `value`, giá trị theo 5 phần (`savings` = cash, `gold`, `etf` = cổ phiếu là ETF trong danh sách ETF của Giải ngân, `picks` = cổ phiếu khác, `crypto`), tỷ trọng thực, `isEstimate`.

Chuyển dữ liệu cũ (migration): với mỗi `GoalAllocation`, mã đó gắn vào mục tiêu có `pct` lớn nhất (gắn các giao dịch chưa gắn của mã đó). Sau đó **xoá** bảng `GoalAllocation`, cột `Goal.targetAllocation`, `Goal.expectedReturnPct`.

### 14.2 Dữ liệu

- `Goal`: `template String?` (house | car | education | retirement | emergency | grow | custom), `priority Int @default(4)` (§2.3, tính từ kiểu + mẫu khi lưu, người dùng không nhập), `monthlyContributionMax Float?` (góp "20–30 tr": `monthlyContribution` = 20, max = 30), `contributionDay Int?` (1–28, mặc định 5), `startedAt DateTime @db.Date` (backfill = `createdAt`), `monthlyExpense Float?` + `safetyMonths Int?` (kiểu `safety`, `targetAmount` = tích). `kind` thêm `safety`.
- `Transaction.goalId String?` + index `(userId, goalId)`.
- `DeploymentPlan`: `goalId String?` (SetNull), `monthlyAmount Float?`; `mode` thêm `both` (`amount` = vốn ban đầu, `monthlyAmount` = mỗi tháng).
- Bảng mới `GoalContribution`: `id, userId, month (date, ngày 1), amount (tổng tháng), split Json (mỗi mục tiêu: số tiền + các dòng {part, label, symbol?, amount, reason}), status (planned | done | skipped), skipReason?, createdAt, doneAt?`; unique `(userId, month)`.

### 14.3 Hàm thuần (có test)

- `goalTargetMix(goal, profile, today)`: `return` → tỷ trọng của phương án đã chọn (v2); `amount` → `suggestMix` theo số tháng còn lại (v2); `safety` → 100% tiền gửi.
- `routeContribution(amount, currentByPart, targetMix, minUnit)`: chia tiền mới vào phần thiếu so với tỷ trọng đích **sau khi góp**, không bán; vàng tối thiểu 1 chỉ (giá hiện tại), phần lẻ vào tiền gửi; mỗi dòng 1 câu lý do. (Lệch theo thị trường để đợt D.)
- `splitAcrossGoals(total, goals)`: theo `priority` tăng dần, mỗi mục tiêu nhận tối đa `requiredMonthly` (`return`: `monthlyContribution`; `safety` đã đủ: 0); dư → mục tiêu `return` (nhiều thì chia đều), không có `return` thì chia theo tỷ lệ `requiredMonthly`; thiếu → trả `shortfall` theo từng mục tiêu.
- `goalLevers(...)`: 4 cách (§7.4): góp thêm (số cần để kịp ngày đích), tăng cổ phiếu một bậc (trong giới hạn thời gian và mức lỗ tối đa; vượt thì `locked` + lý do), lùi ngày (ngày đạt theo lộ trình hiện tại), hạ đích (số đạt được vào ngày đích). `return`: chỉ "góp thêm" và "tăng rủi ro" (đạt mức lãi mong muốn).
- `goalTrack(...)`: số tháng góp đúng (`GoalContribution` done / số tháng từ `startedAt`), lệch tỷ trọng lớn nhất (điểm %), số lần mua có lý do (`Transaction.reason` khác null) / tổng lần mua gắn mục tiêu; ngày dự kiến đạt + khoảng (xấu / tốt) cho `amount`; `status`: `on_track` | `in_range` | `behind` (`behind` khi ngày đạt trung bình trễ ≥ 3 tháng) | `reached`.

### 14.4 API

- `GET /goals`: mỗi mục tiêu thêm `actual` (giá trị, theo phần), `targetMix`, `track`, `template`, `priority`; kèm `unassigned` (giá trị + danh sách mã chưa thuộc mục tiêu, chỉ khi ≥ 2 mục tiêu) và `contribution` của tháng này (nếu có).
- `POST /goals/contribution/preview { amount }` → `{ month, perGoal: [{ goalId, amount, shortfall, lines }] }` (không ghi).
- `POST /goals/contribution { amount }` → lưu tháng này (`planned`); `POST /goals/contribution/:id/done`, `/skip { reason }`.
- `GET /goals/:id/levers`.
- `POST /goals/:id/assign { assetType, symbol }`.
- Giao dịch: tạo / sửa nhận `goalId` (kiểm tra thuộc người dùng). Giải ngân: nhận `goalId`, `mode: 'both'`, `monthlyAmount`.
- Bỏ khỏi API / DTO: `allocations`, `targetAllocation`, `expectedReturnPct`, `progress.assets`, `deviation`. Cố vấn (`advisor/tool-data.ts`) đọc `targetMix` + `actual` thay cho các trường cũ. Cảnh báo danh mục điền sẵn tỷ trọng lệch từ `targetMix` gộp của các mục tiêu thay cho `targetAllocation`.

### 14.5 Giao diện (theo mockup)

- `/goals` = artboard 2: thẻ mục tiêu v3 (`amount`: tiến độ + vạch lộ trình + ngày dự kiến + tỷ trọng đích/thực + việc tiếp theo + 2 nút; `return`: 3 ô hành vi + câu lợi suất; `safety`: một dòng). Khối "Chưa thuộc mục tiêu" (khi có) với nút gắn từng mã.
- Tạo mục tiêu = artboard 6 (lưới mẫu) → form rút gọn theo kiểu; bỏ phần gán tài sản, tỷ trọng mong muốn, lợi suất tự nhập, mô phỏng.
- Sheet góp tiền tháng = artboard 3; sheet "Tới đích sớm hơn" = artboard 5.
- Form giao dịch: ô "Mục tiêu" khi có ≥ 2 mục tiêu đang chạy.
- Giải ngân: chọn mục tiêu; thêm cách "Vốn ban đầu + mỗi tháng".
- Thanh đáy (§11.3). Trang Hôm nay (artboard 1) làm ở đợt B.

## 15. Bổ sung 04/11/2026: minh bạch cách ra tỷ trọng

Chủ sản phẩm hỏi vì sao mục tiêu 10–12% luôn ra 80% cổ phiếu. Kết luận: do bảng giả định + thang tỷ trọng (v2), chỉ cổ phiếu có lợi suất trung bình > 10% nên muốn trung bình ≥ 10% phải ~80% cổ phiếu; quy tắc do app viết, **chưa có chuyên gia duyệt**.

Đã duyệt và làm:
1. Ghi rõ trên giao diện (form mục tiêu sinh lời, chi tiết thẻ, trang Mục tiêu, kết quả Giải ngân): "Tỷ trọng do quy tắc của app tính từ dữ liệu lịch sử có nguồn, chưa được chuyên gia tài chính duyệt."
2. Bảng "Vì sao ra tỷ lệ này" (`GoalAdvice.compare`): 4 mức lãi cạnh nhau — cổ phiếu %, kỳ vọng, năm xấu (tiền), đánh dấu vượt mức lỗ đã khai; bấm một dòng để chọn mức đó.
3. Giả định tiền gửi 5 / 6 / 7% → 4,5 / 5,5 / 6,5% (xem DESIGN_GOALS_V2 §1).

Không làm: thêm quỹ trái phiếu. Số liệu (Fmarket 10/2025: 12 tháng 7,4–9,1%; 2026 đến giữa tháng 10: 5,5–6,2%; 2022 bị rút ~35% quy mô) cho thấy thêm vào chỉ giảm cổ phiếu ở mức 10–12% từ 80% xuống ~75%, trong khi cần thêm loại tài sản "chứng chỉ quỹ" và nguồn giá NAV. Để sau, có thể xem lại khi có chuyên gia duyệt bảng giả định.
