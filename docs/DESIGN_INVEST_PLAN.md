# Thiết kế: Kế hoạch giải ngân

- Ngày: 01/11/2026. Trạng thái: **chủ sản phẩm đã duyệt toàn bộ đề xuất ở §10 (01/11/2026), đã làm xong**. Những chỗ làm khác bản đề xuất ghi ở §11.
- Vấn đề: app có nhiều công cụ (bảng giá, danh mục, Soi lời khuyên, tái cân bằng, mục tiêu) nhưng người dùng mở ra vẫn không biết nên mua gì. Hỏi cố vấn thì được câu trả lời từng lần, không thành một kế hoạch có số tiền, có lịch và có lý do để bám theo.
- Mục đích: người dùng nhập "tôi có X triệu" (một lần hoặc mỗi tháng). App lập kế hoạch: chia vào loại tài sản nào, bao nhiêu, mua sản phẩm cụ thể gì, chia mấy đợt vào ngày nào, vì sao từng dòng, khi nào xem lại. Kế hoạch được lưu, nhắc từng đợt, và ghi sổ khi người dùng đã mua.
- Nguyên tắc: số tiền và tỷ trọng do quy tắc trong code tính (có test), AI chỉ diễn giải lý do. Dùng dữ liệu đã có (hồ sơ, danh mục, mục tiêu) trước khi hỏi thêm. Chống FOMO: không đuổi giá, không đòn bẩy, không altcoin. Không tự ghi giao dịch. Kế hoạch là tham khảo, quyết định là của người dùng.

## 1. Ví dụ người dùng thấy

Chị B: kiểu Cân bằng, khung thời gian trên 3 năm, đầu tư 1–3 năm, chịu được danh mục giảm 30%, đã có quỹ dự phòng, chưa giữ tài sản nào. Nhập 100 triệu, giải ngân một lần.

| Phần | Tỷ trọng | Số tiền | Mua gì | Cách mua | Vì sao (tóm tắt) |
|---|---:|---:|---|---|---|
| Tiền gửi tiết kiệm | 30% | 30 tr | Kỳ hạn 6–12 tháng | Đợt 1 (ngay) | Phần ổn định, có sẵn tiền khi cổ phiếu giảm; so lãi suất với CPI để biết lãi thực |
| Vàng | 15% | 15 tr | Sản phẩm có chênh lệch mua–bán thấp nhất lúc lập | 1 đợt (mỗi đợt phải đủ 1 chỉ) | Phòng thủ khi lạm phát, tỷ giá biến động; không sinh dòng tiền nên giữ ở mức vừa phải |
| Cổ phiếu lõi (ETF) | 35% | 35 tr | E1VFVN30 (bám VN30) | 3 đợt, mỗi tháng 1 đợt | Mua cả rổ doanh nghiệp lớn, không phải đoán mã |
| Cổ phiếu tự chọn | 15% | 15 tr | Để trống tới khi chị có luận điểm cho một mã | Lên lịch khi đã viết kế hoạch cho mã đó | Giới hạn phần rủi ro do tự chọn mã |
| Crypto | 5% | 5 tr | BTC | 3 đợt, mỗi tháng 1 đợt | Phần nhỏ, chịu được nếu mất phần lớn giá trị |

Kịch bản xấu (giả định ở §3, bước 2): danh mục mục tiêu giảm khoảng 26%, trong mức 30% chị chịu được. Nếu chị chỉ chịu được 20% thì app chuyển bớt crypto, tự chọn, ETF sang tiền gửi tới khi mức giảm còn dưới 20%.

Lịch: 01/11 tiền gửi 30 tr, vàng 15 tr, ETF 11,7 tr, tự chọn 5 tr, BTC 1,7 tr · 01/12 ETF 11,7 tr, tự chọn 5 tr, BTC 1,7 tr · 01/01 ETF 11,6 tr, tự chọn 5 tr, BTC 1,6 tr. Số chứng chỉ ETF ghi rõ số lô chẵn và lô lẻ.

Người đã có tài sản: tiền mới chỉ lấp phần đang thiếu so với tỷ trọng mục tiêu. Phần đang thừa ghi chú "đang cao hơn mục tiêu, không mua thêm", bản 1 không gợi ý bán.

## 2. Phạm vi

| | Bản 1 | Để sau |
|---|---|---|
| Đầu vào | Số tiền một lần hoặc góp mỗi tháng; lúc cần dùng tiền | Nhiều kế hoạch theo từng mục tiêu |
| Loại tài sản | Tiền gửi, vàng, ETF niêm yết, cổ phiếu tự chọn, BTC/ETH | Chứng chỉ quỹ mở, trái phiếu (chưa có dữ liệu và loại tài sản), altcoin không làm |
| Hành động | Chỉ mua | Gợi ý bán để tái cân bằng |
| Tiền gửi | Ghi sổ là tiền mặt VND như hiện nay | Loại tài sản tiền gửi có kỳ hạn, lãi suất, ngày đáo hạn |

## 3. Quy tắc lập kế hoạch (hàm thuần, có test)

### Bước 1: lớp an toàn, xét trước khi đầu tư

1. **Dư nợ margin** (khảo sát trả lời có dùng margin): hỏi lại còn dư nợ không. Còn thì gợi ý trả trước khi giải ngân thêm vào cổ phiếu.
2. **Nợ lãi cao** (thẻ tín dụng, vay tiêu dùng): hỏi một câu có/không và số tiền. Có thì phần đầu tiên dùng để trả nợ.
3. **Quỹ dự phòng**: khảo sát nói "chưa có" thì hỏi chi tiêu thiết yếu mỗi tháng và số đã để dành. Mặc định 6 tháng chi tiêu, người dùng sửa được 3–12 tháng. Phần này vào tiền gửi rút được ngay, không tính vào phần đầu tư.
4. **Tiền cần dùng trong 12 tháng** (khung "dưới 1 năm" hoặc mục tiêu đến hạn trong 12 tháng): không vào cổ phiếu, crypto; chỉ tiền gửi kỳ hạn khớp ngày cần tiền.

### Bước 2: tỷ trọng mục tiêu theo kiểu nhà đầu tư (bảng mặc định, cần duyệt)

| Kiểu | Tiền gửi | Vàng | ETF | Tự chọn | Crypto |
|---|---:|---:|---:|---:|---:|
| Thận trọng | 55 | 20 | 25 | 0 | 0 |
| Cân bằng | 30 | 15 | 35 | 15 | 5 |
| Tăng trưởng | 15 | 10 | 45 | 20 | 10 |
| Mạo hiểm | 10 | 5 | 40 | 30 | 15 |

Điều chỉnh, mỗi điều chỉnh có một câu giải thích hiện cho người dùng:

- Khung 1–3 năm: chuyển phần vượt sang tiền gửi để ETF + tự chọn ≤ 40%, crypto ≤ 5%.
- Tiền đầu tư gần như là toàn bộ tài sản (câu `income_share` = "Gần như toàn bộ"): hạ một bậc kiểu.
- Mới bắt đầu (dưới 1 năm kinh nghiệm): tự chọn = 0, dồn vào ETF.
- Dễ FOMO hoặc từng mua theo hội nhóm: crypto ≤ 5%, tự chọn ≤ 10%.
- Kịch bản xấu (giả định gần với năm 2022 của VN-Index và BTC): cổ phiếu và ETF −40%, crypto −75%, vàng −15%, tiền gửi 0%. Nếu mức giảm của danh mục mục tiêu vượt mức lỗ tối đa người dùng chịu được thì giảm dần crypto, tự chọn, ETF (theo thứ tự đó) sang tiền gửi tới khi khớp.
- Người dùng chỉnh tay được từng phần. Vượt trần theo hồ sơ thì hiện cảnh báo và ghi lại "bạn chọn khác gợi ý", không chặn.

### Bước 3: so với danh mục đang có

Quy đổi tài sản đang giữ về 5 phần: tiền mặt → tiền gửi, vàng → vàng, cổ phiếu có `type = ETF` trong danh sách mã → ETF, cổ phiếu khác → tự chọn, coin → crypto. Dùng tầng tính tái cân bằng hiện có (`portfolio/analysis/rebalance.*`, chế độ `buy_only`, `newMoney` = số tiền) để tiền mới chỉ lấp phần thiếu.

### Bước 4: chọn sản phẩm trong từng phần

- **Tiền gửi**: kỳ hạn không dài hơn lúc cần tiền, mặc định 6–12 tháng. Lãi suất: xem điểm cần chốt 5.
- **Vàng**: sản phẩm có chênh lệch mua–bán (%) thấp nhất trong bảng giá app đang có lúc lập. Ghi rõ "mua xong bán ngay sẽ lỗ X%".
- **ETF**: mặc định E1VFVN30, hiện thêm FUEVFVND để chọn. Giá từ bảng giá, số chứng chỉ làm tròn theo lô như phần tái cân bằng.
- **Tự chọn**: app không tự điền mã. Người dùng chọn mã, xem phân tích của cố vấn, rồi viết Kế hoạch đầu tư (luận điểm, điều kiện sai, mốc cắt lỗ) thì phần này mới được lên lịch. Nút "Tìm ứng viên" mở bộ lọc với bộ tiêu chí chất lượng; danh sách là để nghiên cứu, không phải khuyến nghị.
- **Crypto**: BTC; phần crypto từ 10 triệu trở lên chia thêm ETH. Không altcoin.

### Bước 5: lịch giải ngân

- Trả nợ, quỹ dự phòng, tiền gửi: đợt 1 (ngay).
- Vàng: 2 đợt cách 1 tháng. ETF, tự chọn, crypto: mặc định 3 đợt mỗi tháng một lần; người dùng chọn 1, 3 hoặc 6 đợt.
- Lý do hiện cho người dùng, nói thật cả hai mặt: chia đợt giảm rủi ro mua đúng đỉnh và giảm hối tiếc; khi thị trường đi lên, bỏ tiền một lần thường lãi hơn.
- Góp mỗi tháng: mỗi tháng một đợt theo tỷ trọng, ưu tiên phần đang thiếu nhiều nhất.
- Không có quy tắc "đợi giảm mới mua". Đợt đến hạn thì mua theo lịch. Giá vừa tăng mạnh thì nhắc không mua thêm ngoài kế hoạch.

### Bước 6: xem lại

3 tháng một lần, hoặc khi một phần lệch tỷ trọng mục tiêu hơn 5 điểm %. Phần lệch dùng Cảnh báo danh mục "lệch tỷ trọng" đã có, lấy tỷ trọng mục tiêu từ kế hoạch.

## 4. AI

- Không quyết định con số. Nhận kết quả quy tắc đã tính, hồ sơ, danh mục, rồi viết phần "Vì sao" cho từng dòng và một đoạn tóm tắt. Giọng người anh đi trước, không hứa lợi nhuận.
- Số trong lời AI được đối chiếu với số đã tính (`writeChecked` có sẵn). AI lỗi hoặc hết quota thì dùng câu giải thích mẫu của từng quy tắc; kế hoạch vẫn ra đủ.
- Cố vấn chat: thêm công cụ `get_my_invest_plan` để trả lời "đợt này mua gì", "sao kế hoạch chia vậy". Người dùng hỏi "có X tiền nên làm gì" thì cố vấn gợi ý mở Kế hoạch giải ngân.

## 5. Dữ liệu

Tên `DeploymentPlan` để không trùng `InvestmentPlan` (kế hoạch theo từng mã).

- `DeploymentPlan`: userId, portfolioId?, amount, mode (`one_time` | `monthly`), needBy?, inputs (Json: quỹ dự phòng, nợ, margin, kèm ngày khai), targetMix (Json: 5 phần), adjustments (Json: quy tắc đã áp dụng và câu giải thích), overrides (Json: phần người dùng tự chỉnh), rationale (Json: lời AI), status (`active` | `done` | `cancelled`), nextReviewAt, createdAt.
- `DeploymentStep`: planId, dueDate, part, instrument (mã / sản phẩm vàng / kỳ hạn), amountVnd, status (`pending` | `done` | `skipped`), skipReason?, transactionId?, doneAt?.
- Không thêm cột vào hồ sơ ở bản 1: dữ liệu tự khai (chi tiêu, nợ) lưu trong `inputs` của kế hoạch, kèm ngày khai.

## 6. Màn hình

- Lối vào: thẻ trên Hôm nay ("Có tiền nhàn rỗi? Lập kế hoạch giải ngân") khi chưa có kế hoạch; nút ở Danh mục; gợi ý của cố vấn; menu Thêm.
- Bước 1: số tiền, một lần hay mỗi tháng, lúc nào cần dùng (điền sẵn từ hồ sơ và mục tiêu).
- Bước 2: chỉ hỏi cái còn thiếu (quỹ dự phòng, nợ lãi cao, margin).
- Bước 3: kết quả. Thanh tỷ trọng mục tiêu so với hiện tại; bảng phần → số tiền → mua gì → vì sao; kịch bản xấu; chỉnh tỷ trọng thì tính lại ngay; lịch các đợt.
- Bước 4: lưu. Hôm nay hiện "Đợt 2 · 01/12 · ETF 11,7 triệu"; nhắc 8:00 ngày đến hạn qua thông báo, Telegram, Web Push theo cài đặt. Bấm "Đã mua" mở form giao dịch điền sẵn; người dùng xác nhận mới ghi sổ, sau đó đợt được đánh dấu xong. Có "Bỏ qua đợt này" kèm lý do.
- Mua cổ phiếu tự chọn thì mở tạo Kế hoạch đầu tư (đã có) cho mã đó.

## 7. Pháp lý và an toàn

- Câu chữ: "kế hoạch tham khảo theo hồ sơ của bạn, quyết định là của bạn". Bảng tỷ trọng và quy tắc công khai trong trang "Vì sao tỷ trọng này".
- App không chọn mã cổ phiếu riêng lẻ cho người dùng. ETF, vàng, tiền gửi là sản phẩm phổ thông. Vẫn cần hỏi luật trước khi thu phí (README đã ghi).
- Không đòn bẩy, không altcoin, không bán khống, không "chờ đáy".

## 8. Kiểm thử

- Unit: bảng tỷ trọng và từng điều chỉnh, kịch bản xấu, lớp an toàn, phân bổ chỉ-mua với danh mục có sẵn, lịch đợt (ngày, làm tròn lô ETF).
- Tích hợp (PostgreSQL): tạo, lưu, đánh dấu đợt, ghi sổ từ đợt, nhắc đến hạn, quyền sở hữu.
- AI: số trong lời giải thích khớp số đã tính; AI lỗi vẫn ra kế hoạch đủ.
- Playwright (điện thoại): luồng 4 bước.

## 9. Trình tự làm

1. Quy tắc, API xem trước (không lưu), test.
2. Màn hình xem trước và chỉnh tỷ trọng.
3. Lưu, lịch đợt, nhắc, thẻ Hôm nay, ghi sổ từ đợt.
4. AI viết "Vì sao", công cụ cho cố vấn.

## 10. Điểm cần chủ sản phẩm chốt

1. Bảng tỷ trọng mặc định và các trần điều chỉnh ở §3, bước 2.
2. Cổ phiếu tự chọn: đề xuất app không tự điền mã, người dùng tự chọn và phải có kế hoạch cho mã, có nút "Tìm ứng viên" mở bộ lọc. Phương án khác: app đề xuất 3–5 mã cụ thể (rủi ro pháp lý cao hơn, gần với kiểu hô mã).
3. ETF mặc định: E1VFVN30 (đề xuất), FUEVFVND, hay để người dùng chọn.
4. Chia đợt mặc định cho phần rủi ro: 3 tháng (đề xuất).
5. Lãi suất tiết kiệm: bản 1 tra web có nguồn và ngày (đề xuất), hay chọn một nguồn dữ liệu riêng.
6. Giả định kịch bản xấu: cổ phiếu −40%, crypto −75%, vàng −15%.
7. Tên tính năng: "Kế hoạch giải ngân".

## 11. Đã làm (01–02/11/2026) và khác bản đề xuất

- Code: `backend/src/deployment/` (quy tắc thuần `deployment.mix.ts`, `deployment.plan.ts`; lưu và theo dõi đợt; nhắc 8:00 qua worker `deployment.remind`; AI giải thích `deployment-explain.service.ts`), trang `/deployment`, thẻ trên Hôm nay, công cụ cố vấn `get_my_invest_plan`, loại thông báo `deployment`, migration `20261101090000_deployment_plans`.
- Bảng tỷ trọng ở §3 bước 2 là nguồn duy nhất của cả app (`TARGET_MIX` trong `profile/quiz.ts`): mức tham khảo của cố vấn, "Cần xem lại" trên Hôm nay và gợi ý Cảnh báo danh mục đổi theo (trước đây Cân bằng là 25/15/55/5).
- Bước 3: tiền mới chia theo 5 phần bằng phép "chỉ mua" riêng (theo tỷ lệ phần thiếu), không dùng tầng tái cân bằng theo từng mã vì tầng đó cần mã cụ thể và chỉ cho mua vàng / coin đang giữ.
- Vàng: mỗi đợt phải đủ giá 1 chỉ, nên phần vàng nhỏ mua một lần (giá thật khoảng 14–15 triệu/chỉ).
- Kịch bản xấu: ngoài mức giảm của tỷ trọng mục tiêu, tính cả danh mục thực tế sau khi mua. Tài sản đang giữ vượt mục tiêu (bản này chỉ mua) có thể làm danh mục vẫn giảm quá mức chịu được: hiện cảnh báo và gợi ý trang Tái cân bằng.
- Crypto: phần crypto của kế hoạch từ 10 triệu chia BTC 70%, ETH 30%.
- Góp mỗi tháng: lập lịch 6 tháng; phần nhận dưới 500.000 ₫ trong tháng gộp vào phần nhận nhiều nhất.
- AI chỉ viết sau khi lưu (khoảng 50 giây, không chặn việc lưu), quota riêng `AI_DEPLOYMENT_EXPLAIN_DAILY_LIMIT` (mặc định 10/ngày); số không khớp sau một lần viết lại thì không lưu, giữ câu mẫu.
- "Đã mua" mở form giao dịch điền sẵn (lý do nhật ký "Theo kế hoạch"); trả nợ, quỹ dự phòng và tiền gửi khi tiền đã ghi sẵn là tiền mặt thì chỉ đánh dấu xong.
- Chưa làm: tiền gửi có kỳ hạn như một loại tài sản riêng, gợi ý bán, nhiều kế hoạch theo từng mục tiêu (như §2).

