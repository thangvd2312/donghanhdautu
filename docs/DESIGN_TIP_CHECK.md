# Thiết kế: Soi lời khuyên

- Ngày: 26/10/2026. Trạng thái: **bản đề xuất, chờ chủ sản phẩm duyệt** trước khi code.
- Mục đích: cho người dùng kiểm chứng một "lời khuyên" (tin hô mã trong nhóm Zalo / Telegram / Facebook, lời môi giới, bạn bè) bằng dữ liệu có nguồn **ngay lúc họ sắp FOMO**, ghi lại quyết định, và tự chấm lại sau 30 / 90 ngày để người dùng có bằng chứng về chính những nguồn mình đang nghe.
- Nguyên tắc giữ nguyên từ sản phẩm: chống FOMO, mọi con số có nguồn, không khuyến nghị mua / bán, không ghi gì vào sổ giao dịch thật.

## 1. Phạm vi

| | Bản 1 (làm ngay) | Để sau |
|---|---|---|
| Đầu vào | Dán văn bản (tối đa 4.000 ký tự), ghi tên nguồn (tuỳ chọn) | Ảnh chụp màn hình (chat hiện chưa nhận ảnh, cần thêm đường tải ảnh) |
| Tài sản | Cổ phiếu VN, coin (cặp USDT trên Binance) | Vàng |
| Mỗi lần soi | Một mã. Tin nhắc nhiều mã thì người dùng chọn mã (mặc định mã đầu tiên) | Soi cả nhóm mã trong một phiếu |
| Kiểm chứng | Dữ liệu trong app: giá, kỹ thuật, định giá so với chính nó, BCTC, tin 14 ngày, khuyến nghị Vietcap, danh mục và hồ sơ của người dùng | Tìm web cho tin đồn ("sắp ký hợp đồng…"): bản 1 đánh dấu *chưa kiểm chứng được*, nút "Hỏi tiếp cố vấn" để tìm thêm |
| Theo dõi | Chấm lại sau 30 và 90 ngày, thống kê theo nguồn của riêng người dùng | Thống kê chéo người dùng ("nhóm này bị soi 120 lần") — cần cân nhắc riêng tư và pháp lý |

## 2. Luồng người dùng

### 2.1 Soi

1. Mở **Soi lời khuyên** (menu Thêm; thẻ nhắc trên trang Hôm nay; gợi ý trên trang Cố vấn). Dán tin, ghi nguồn ("Nhóm VIP anh T"), bấm **Soi**.
2. **Bước 1 (≈2 giây, AI nhanh)**: bóc tách lời khuyên → thẻ *Lời khuyên nói gì*: mã, hướng (mua / bán / giữ), giá mục tiêu, cắt lỗ, thời hạn, lý do nêu ra, lời hứa ("x2", "ăn chắc"). Tên doanh nghiệp không kèm mã ("Hoà Phát") được quy về mã bằng bảng tên thường gọi đã có (`alerts/aliases.ts`) và AI. Mã phải tồn tại (kiểm bằng `PlanAssetsService.normalize`). Không nhận ra mã → hỏi người dùng gõ mã.
3. **Bước 2 (≈15–30 giây, AI phân tích)**: app tự lấy dữ liệu (không qua AI), tính **mức nóng** và **với riêng bạn** bằng code, rồi AI viết phần đọc dữ liệu. Trong lúc chờ, màn hình hiện từng bước: *Đang lấy dữ liệu HPG… Đang đọc tin 2 tuần… Cố vấn đang đối chiếu…*
4. **Phiếu soi** gồm 6 khối, thứ tự trên điện thoại:
   1. **Mức nóng 0–100** (thang: 0–29 bình thường · 30–59 nóng · 60–100 rất nóng) với từng lý do cộng điểm, bấm mở xem.
   2. **Lời khuyên nói gì** (bước 1).
   3. **Dữ liệu nói gì**: 3–6 ý, mỗi ý kèm số và nguồn (Vietcap / Binance / CafeF…). Ví dụ: "Giá đã tăng 18% trong 1 tháng, cách đỉnh 52 tuần 2%", "P/E 14,2 — cao hơn 80% số quý trong 8 năm của chính HPG", "Vietcap Research: khuyến nghị Khả quan, giá mục tiêu 31.000".
   4. **Lời khuyên thiếu gì**: không có cắt lỗ, không có thời hạn, không có nguồn, không có số liệu, chỉ có lời hứa.
   5. **Với riêng bạn**: nếu mua *X đồng* (ô sửa được, đổi là tính lại ngay, không gọi AI) thì mã chiếm bao nhiêu % tài sản so với mức tối đa cho hồ sơ; lỗ bao nhiêu nếu chạm cắt lỗ (của tip, hoặc −15%) so với mức lỗ chịu được; đã nắm giữ chưa và đang lãi / lỗ; đã có kế hoạch cho mã này chưa (link); tiền mặt có đủ không.
   6. **Cố vấn nói**: 2–3 câu điềm tĩnh, không bảo mua hay bán; kèm 2–3 câu hỏi tự trả lời trước khi hành động.
5. **Thanh quyết định** dính đáy màn hình, 4 nút:
   - **Bỏ qua** — ghi quyết định.
   - **Theo dõi** — thêm vào watchlist, đặt cảnh báo giá (mặc định: báo khi giảm 10% so với giá lúc soi; chỉnh được trong sheet).
   - **Viết kế hoạch trước** — mở form kế hoạch đã điền sẵn từ phiếu (luận điểm = lý do của tip, ghi rõ "theo nguồn X nói"; điều kiện xem lại / bán = những gì tip thiếu; mục tiêu / cắt lỗ của tip nếu có). Lưu xong, kế hoạch gắn với phiếu.
   - **Thử bằng tiền ảo** — sang trang Luyện tập với lệnh điền sẵn (mã, số lượng ≈ số tiền giả định / giá).
   - Nút phụ: **Hỏi tiếp cố vấn** — tạo cuộc trò chuyện có sẵn tin + tóm tắt phiếu (cùng cách bản tin đang làm), người dùng hỏi tiếp ở đó.
6. Người dùng **mua thật** trong vòng 7 ngày sau khi soi (có giao dịch mua mã đó trong sổ) → phiếu tự ghi "Đã mua theo", kể cả khi trước đó chọn Bỏ qua. Không hỏi, không chặn: chỉ ghi để sau này nhìn lại.

### 2.2 Sổ lời khuyên

- Danh sách phiếu đã soi: mã, nguồn, ngày, mức nóng, quyết định, kết quả 30 / 90 ngày (khi có).
- **Theo nguồn**: với mỗi nguồn: số lời khuyên, số đã chấm, số đúng / sai / chưa rõ, thay đổi giá trung bình so với tham chiếu (VN-Index hoặc BTC). Định nghĩa "đúng" ghi ngay trên màn hình (mục 5).
- Thông báo sau 30 / 90 ngày (trong app; gửi ra Telegram / Web Push khi người dùng bật): *"Lời khuyên HPG (nhóm VIP anh T) sau 30 ngày: −8%, VN-Index +2%. Bạn đã bỏ qua."*

## 3. Mức nóng (tính bằng code, có test, không do AI chấm)

Điểm cộng dồn, tối đa 100. Ngưỡng giá áp cho cổ phiếu; coin dùng ngưỡng gấp đôi (cùng quy ước với cảnh báo biến động).

| Nhóm | Điều kiện (cổ phiếu) | Điểm |
|---|---|---|
| Đã chạy | Tăng ≥ 10% trong 1 tuần / ≥ 25% trong 1 tháng | +20 / +15 (lấy mức cao hơn, tối đa 20) |
| | Cách đỉnh 52 tuần ≤ 3% | +10 |
| | Giá cao hơn MA50 ≥ 15% | +10 |
| Quá mua | RSI14 > 70 / > 80 | +10 / +15 |
| Thanh khoản bất thường | Khối lượng phiên gần nhất ≥ 2 lần trung bình 20 phiên | +10 |
| Lời lẽ hối thúc | Mỗi từ / cụm trong danh sách ("múc", "all in", "vào ngay", "không mua là tiếc", "chắc chắn", "x2", "ăn bằng lần", "kèo", "phím", "hàng VIP", "target", "gom", "đánh lên"…) | +5 mỗi cụm, tối đa 15 |
| Thiếu | Không có cắt lỗ / không thời hạn / không số liệu / không nguồn | +10 / +5 / +10 / +5 |
| Hứa quá | Giá mục tiêu ≥ +30% trong ≤ 1 tháng (hoặc không nêu thời hạn) | +10 |

- Dữ liệu thiếu (mã mới niêm yết, không có lịch sử) → nhóm đó 0 điểm và ghi "không đủ dữ liệu", không đoán.
- Mỗi điểm cộng lưu lại kèm số liệu lúc soi (ví dụ "RSI14 = 78") để phiếu đọc lại sau vẫn giải thích được.
- Điểm là về *lời khuyên*, không phải về người dùng; hồ sơ "dễ FOMO" chỉ ảnh hưởng khối *Với riêng bạn* và giọng của cố vấn.

## 4. Với riêng bạn (tính bằng code)

- Số tiền giả định: người dùng nhập; chưa nhập thì lấy *min(10% tổng tài sản, tỷ trọng tối đa theo hồ sơ)* và ghi rõ "giả sử".
- Tỷ trọng sau khi mua = (giá trị đang giữ + số tiền) / (tổng tài sản + số tiền); so với tỷ trọng tối đa cho một mã theo hồ sơ (Thận trọng 10%, Cân bằng 15%, Tăng trưởng 20%, Mạo hiểm 25% — đưa thành hằng số dùng chung, prompt cố vấn đang ghi tay các số này).
- Lỗ nếu chạm cắt lỗ: số tiền × (cắt lỗ của tip, không có thì 15%); quy ra % tổng tài sản, so với mức lỗ chịu được của hồ sơ.
- Đang giữ: số lượng, lãi / lỗ %, cờ lỗ vượt mức chịu được (đã có trong định giá).
- Kế hoạch đang có cho mã: link; nếu kế hoạch đang ở trạng thái "đến hạn xem lại" hoặc "chạm cắt lỗ" thì nói ra.
- Tiền mặt (VND cho cổ phiếu, USDT cho coin) có đủ không.

## 5. Chấm lại sau 30 / 90 ngày (worker, không AI)

- Việc `tips.review` chạy 15:30 hằng ngày (giờ VN): phiếu đủ 30 (rồi 90) ngày kể từ lúc soi và chưa chấm → lấy giá hiện tại và tham chiếu (VN-Index cho cổ phiếu, BTC cho coin), tính % thay đổi so với lúc soi, có chạm mục tiêu / cắt lỗ chưa (so với giá hiện tại; đỉnh / đáy trong kỳ để bản sau), quyết định của người dùng và cờ "đã mua theo".
- **Đúng** = giá đi theo hướng tip ≥ 5% (coin ≥ 10%) hoặc chạm mục tiêu; **Sai** = đi ngược ≥ 5% (coin ≥ 10%) hoặc chạm cắt lỗ; còn lại **Chưa rõ**. Luôn hiển thị kèm tham chiếu để thấy "đúng nhưng thua VN-Index".
- Thiếu giá (huỷ niêm yết, nguồn lỗi) → thử lại các ngày sau, quá 7 ngày ghi "không có giá".
- Tạo thông báo loại mới `tip_review` (khoá chống trùng `tip_review:<id>:30|90`), mặc định chỉ trong app như `journal_monthly`.

## 6. AI

- **Bước 1, bóc tách** (`LlmService.json`, tier *fast*, tính năng `tip_extract`): vào = văn bản + danh sách mã ứng viên tìm được bằng regex / bảng tên; ra theo schema `{ symbols[], assetType, direction, targetPrice, stopPrice, horizonDays, reasons[], promises[] }`. Không có khoá AI → vẫn chạy bằng regex + bảng tên, các trường còn lại để trống.
- **Bước 2, đọc dữ liệu** (`LlmService.json`, tier *brief*, tính năng `tip_check`): vào = lời khuyên đã bóc tách + dữ liệu mã (cùng hàm `AdvisorToolData.stock` / `cryptoDetail` mà chat đang dùng) + tin 14 ngày đã gắn nhãn + hồ sơ và danh mục + mức nóng và phần *với riêng bạn* đã tính; ra theo schema `{ dataSays: [{ point, evidence, source }], missing[], unverifiable[], verdict, questions[] }`. Prompt: giọng "người anh đi trước", không dùng từ mua / bán ở thể mệnh lệnh, mỗi `point` phải có một con số lấy từ dữ liệu, không bịa.
- **Kiểm số**: `unmatchedNumbers` (đang dùng cho bản tin, không tốn AI) — ý nào có số không khớp dữ liệu thì bỏ ý đó và ghi log; sau đó `VerifierService` (tier *fast*, như chat) đối chiếu phần còn lại, sai thì thay bằng bản sửa.
- Không có khoá AI: vẫn ra phiếu với mức nóng, dữ liệu thô (giá, RSI, P/E…) và *với riêng bạn*; phần cố vấn ghi "đang tắt".
- Chi phí mỗi lần soi ≈ một câu hỏi phân tích trong chat (bước 2 đọc ~45–65k ký tự dữ liệu). Tính vào quota AI ngày của người dùng (`aiUsage.run`).

## 7. Dữ liệu

```prisma
/// Một lần soi lời khuyên: tin gốc, lời khuyên bóc tách, phiếu, quyết định và kết quả chấm lại
model TipCheck {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  text          String                      // tin gốc, tối đa 4.000 ký tự
  sourceName    String?                     // "Nhóm VIP anh T"; thống kê theo nguồn gộp theo chữ thường
  sourceKind    String?                     // zalo | telegram | facebook | broker | friend | other
  assetType     String                      // stock | crypto
  symbol        String
  claims        Json                        // direction, targetPrice, stopPrice, horizonDays, reasons, promises, otherSymbols
  amountVnd     Float?                      // số tiền giả định người dùng nhập
  priceAtCheck  Float?                      // đơn vị gốc (VND/cp, USDT/coin)
  priceSource   String?
  benchmark     String?                     // VNINDEX | BTC
  benchmarkAtCheck Float?
  score         Int?
  scoreParts    Json?                       // [{ key, label, points, detail }]
  personal      Json?                       // tỷ trọng, lỗ nếu cắt, kế hoạch, tiền mặt
  report        Json?                       // dataSays, missing, unverifiable, verdict, questions, sources, verifier
  status        String   @default("extracted") // extracted | analyzed | failed
  decision      String?                     // ignore | watch | plan | practice
  decidedAt     DateTime?
  boughtAt      DateTime?                   // mua thật trong 7 ngày sau khi soi (tự phát hiện)
  planId        String?
  priceAlertId  String?
  conversationId String?
  review30      Json?                       // { at, price, changePct, benchmarkChangePct, hitTarget, hitStop, outcome }
  review90      Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId, createdAt])
  @@index([status, createdAt])              // worker tìm phiếu đến hạn chấm
}
```

Migration chỉ thêm bảng; không đụng dữ liệu cũ. Xoá tài khoản → xoá phiếu (cascade). Kế hoạch / cảnh báo gắn với phiếu bị xoá thì phiếu chỉ mất link (không ràng buộc khoá ngoại, tránh chặn xoá kế hoạch).

## 8. API (`backend/src/tips`, module mới theo bố cục chuẩn: controller · service · dto · presenter · logic thuần)

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| POST | `/tips` | `{ text, sourceName?, sourceKind?, symbol? }` → bóc tách (bước 1). Tin không nhận ra mã và không có `symbol` → 422 với thông điệp tiếng Việt. Trả `TipCheck` trạng thái `extracted` kèm `otherSymbols` để chọn lại. |
| POST | `/tips/:id/analyze` | `{ symbol?, amountVnd? }` → phân tích (bước 2), trả phiếu đầy đủ. Gọi lại khi đã `analyzed` thì trả phiếu cũ (không tốn AI). |
| PATCH | `/tips/:id` | `{ amountVnd }` → tính lại *với riêng bạn*, không AI. |
| POST | `/tips/:id/decision` | `{ decision, dropPct?, planId? }` → ghi quyết định; `watch` tạo WatchItem + PriceAlert (idempotent: gọi lại không tạo thêm); `plan` kèm `planId` sau khi kế hoạch đã lưu; trả phiếu. |
| GET | `/tips/:id/plan-draft` | Form kế hoạch điền sẵn (`PlanRequest`) dựng từ phiếu, không AI. |
| POST | `/tips/:id/conversation` | Tạo cuộc trò chuyện có sẵn tin + tóm tắt phiếu (mẫu của bản tin), trả `conversationId`. |
| GET | `/tips?cursor&limit` | Sổ lời khuyên. |
| GET | `/tips/:id` | Phiếu. |
| GET | `/tips/sources` | Thống kê theo nguồn. |
| DELETE | `/tips/:id` | Xoá phiếu (không xoá kế hoạch / cảnh báo đã tạo). |

- Id không thuộc người dùng → 404 (cùng quy ước đã sửa ở QA e2e-08).
- Kiểu request / response khai báo trong `contracts/src/tips.ts`.

## 9. Frontend

- Route `/tips` (sổ + ô soi ở đầu trang) và `/tips/:id` (phiếu). Menu *Thêm*: "Soi lời khuyên" ngay dưới *Bảng giá*; thanh đáy giữ nguyên 4 mục.
- Điểm vào: thẻ nhỏ trên trang Hôm nay ("Nghe được tin gì? Soi trước khi mua"); một gợi ý trên màn chào của Cố vấn.
- `api/tips.ts` · `lib/tips.ts` (thang nóng, nhãn kết quả, dựng lệnh luyện tập, kiểm tra form) · `hooks/useTipCheck.ts` (soi, chờ phân tích, đổi số tiền; phản hồi cũ không ghi đè — theo đúng bài vừa sửa) · `components/tips/`: `TipComposer`, `HotScore` (vòng số + danh sách lý do), `ClaimsCard`, `DataSaysList`, `MissingList`, `PersonalImpact`, `AdvisorNote`, `DecisionBar` (+ sheet theo dõi), `ReviewCard`, `SourceStats`, `TipListItem`.
- Điện thoại: phiếu là các thẻ xếp dọc; thanh quyết định dính đáy trên thanh điều hướng; ô nhập tiền kiểu `inputMode="decimal"`, cỡ chữ ≥ 16px; trạng thái tải từng bước, lỗi có nút thử lại, hết quota AI báo rõ.
- Trang Kế hoạch nhận form điền sẵn qua `location.state` (hiện chưa có; thêm nhỏ). Trang Luyện tập nhận lệnh điền sẵn tương tự.

## 10. Kiểm thử và nghiệm thu

- **Unit** (`tips.logic.spec.ts`): mức nóng theo bảng (mỗi dòng một test), tính chất (điểm không giảm khi tăng mức chạy; luôn ≤ 100; thiếu dữ liệu → 0 và ghi chú), nhận từ hối thúc (có dấu / không dấu, chữ hoa), *với riêng bạn* (tỷ trọng, lỗ, tiền mặt), dựng form kế hoạch, phân loại đúng / sai / chưa rõ, thống kê theo nguồn.
- **Integration PostgreSQL** (`tips.int-spec.ts`, LLM và nguồn giá giả): soi → phân tích → đổi số tiền → quyết định *theo dõi* tạo đúng 1 WatchItem + 1 PriceAlert dù gọi 2 lần; mua thật trong 7 ngày → `boughtAt`; worker chấm 30 ngày tạo đúng 1 thông báo (chạy 2 lần không trùng), 90 ngày tiếp theo; thiếu giá → thử lại; 404 id người khác; xoá.
- **Frontend**: Vitest cho `lib/tips.ts` và `useTipCheck` (phản hồi về muộn); Playwright: thêm màn `tips`, `tips-detail`, `tips-decision-sheet` vào `mobile.spec.ts` (audit bố cục) và một kịch bản soi với API giả.
- **Eval AI** (`backend/src/eval`): 10 tin nhắn mẫu kiểu nhóm Zalo / Telegram (cổ phiếu, coin, tên không kèm mã, nhiều mã, không có mã) → bóc tách đúng mã / hướng / mục tiêu; chạy tay trước khi deploy, không nằm trong CI.
- **Tiêu chí nghiệm thu**
  - [ ] Dán tin "HPG múc ngay, target 35, chắc ăn" → trong 30 giây có phiếu đủ 6 khối; mức nóng kèm lý do; mọi số trong *Dữ liệu nói gì* tra được trong dữ liệu nguồn.
  - [ ] Tin ghi "Hoà Phát" không kèm mã vẫn ra HPG; tin nhiều mã cho chọn; tin không có mã thì hỏi lại.
  - [ ] Đổi số tiền giả định → *với riêng bạn* đổi ngay, không gọi AI.
  - [ ] Bốn quyết định hoạt động và được ghi; *theo dõi* tạo cảnh báo đúng mức; *viết kế hoạch* ra form điền sẵn và kế hoạch lưu xong gắn với phiếu.
  - [ ] Mua thật trong 7 ngày → phiếu ghi "đã mua theo".
  - [ ] Sau 30 / 90 ngày có thông báo và kết quả trên phiếu; thống kê theo nguồn đúng với định nghĩa.
  - [ ] Tắt AI vẫn soi được (không có phần cố vấn); hết quota báo rõ.
  - [ ] Không ghi gì vào sổ giao dịch thật; không khuyến nghị mua / bán ở thể mệnh lệnh.

## 11. Chi phí, rủi ro, pháp lý

- AI: 1 lượt nhanh + 1 lượt phân tích + 1 lượt kiểm tra mỗi lần soi; chấm lại không tốn AI. Dùng quota ngày hiện có; thêm `tip_extract`, `tip_check` vào bảng chi phí (`report:usage`).
- Dữ liệu: cùng nguồn Vietcap / Binance / CafeF đã dùng; nguồn lỗi thì phiếu vẫn ra với phần thiếu ghi rõ, không chặn.
- Riêng tư: tin và tên nguồn chỉ của người dùng đó; không gộp giữa các người dùng trong bản 1.
- Pháp lý: phiếu là kiểm chứng thông tin và câu hỏi gợi mở, giữ dòng miễn trừ hiện có; không chấm "mua" / "không mua".
- Sai lệch có thể gặp: tip về cổ phiếu UPCoM thanh khoản thấp (dữ liệu kỹ thuật mỏng → nhiều nhóm "không đủ dữ liệu"); tin đồn không kiểm được bằng dữ liệu trong app → ghi *chưa kiểm chứng được*, không phán đúng sai.

## 12. Trình tự làm

1. Backend: schema + migration, bóc tách, mức nóng, *với riêng bạn*, phân tích + kiểm số, API, unit + integration test. Commit 1.
2. Frontend: trang sổ, phiếu, thanh quyết định, điểm vào, test hook + Playwright. Commit 2.
3. Worker chấm lại, thông báo `tip_review`, thống kê theo nguồn, màn hình kết quả. Commit 3.
4. Deploy, chủ sản phẩm dùng thử với tin thật từ các nhóm đang theo dõi; chỉnh ngưỡng mức nóng theo phản hồi.

## 13. Điểm cần chủ sản phẩm chốt

1. Bản 1 chỉ nhận văn bản, ảnh chụp màn hình để bản sau — đồng ý?
2. Số tiền giả định khi người dùng không nhập: *min(10% tổng tài sản, tỷ trọng tối đa theo hồ sơ)* — hay luôn bắt nhập?
3. Định nghĩa đúng / sai sau 30 ngày: ±5% cổ phiếu, ±10% coin, hoặc chạm mục tiêu / cắt lỗ — đồng ý?
4. Tên: **Soi lời khuyên** (tính năng) và **Sổ lời khuyên** (lịch sử); phương án khác: "Soi phím", "Kiểm tin hô mã".
5. Vị trí: menu Thêm + thẻ trên Hôm nay + gợi ý trên Cố vấn; không đổi thanh đáy — đồng ý?
