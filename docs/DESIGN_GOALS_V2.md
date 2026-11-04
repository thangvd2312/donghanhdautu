# Mục tiêu v2: "Sinh lời đều mỗi năm" và "Có số tiền vào ngày"

Chủ sản phẩm duyệt 04/11/2026: làm cả 2 kiểu; lợi suất kỳ vọng lấy từ một bảng cố định có ghi nguồn (crypto không tính);
khi mức lãi mong muốn cần rủi ro cao hơn mức lỗ tối đa đã khai thì nói thẳng và để người dùng chọn.

Vấn đề cũ: trang chỉ có "cần X vào ngày Y", người dùng tự nhập lợi suất giả định và tự gán tài sản; app không trả lời
"có 100 triệu, muốn lãi đều 10–12%/năm thì đầu tư thế nào".

## 1. Bảng giả định (backend/src/goals/return-plan.ts, `RETURN_ASSUMPTIONS`)

Lợi suất trung bình mỗi năm khi giữ từ 5 năm, VND, trước thuế/phí giao dịch. Một năm cụ thể có thể khác rất xa.

| Phần | Thấp | Trung bình | Cao | Năm xấu | Nguồn |
|---|---|---|---|---|---|
| Tiền gửi 12 tháng | 4,5% | 5,5% | 6,5% | 0% | Lãi 12 tháng bình quân 4 ngân hàng nhà nước ~4,3% (mốc tham chiếu của quỹ DCBF, VFF, 9/2026); ngân hàng nhỏ ~6–7%. Sửa 04/11/2026 (trước: 5 / 6 / 7) |
| Vàng | 3% | 7% | 11% | −15% | WGC: vàng ~9%/năm (USD) 20 năm tới 6/2026; WGC dự báo dài hạn thấp hơn |
| Cổ phiếu lõi (ETF VN30) | 7% | 11% | 14% | −40% | VN-Index 100 (2000) → 1.784 (cuối 2025) ≈ 12%/năm giá; 2010–2019 chỉ ~6,4%/năm (FiinGroup); + cổ tức ~2%, − phí quỹ |
| Cổ phiếu tự chọn | 4% | 11% | 17% | −40% | Như ETF, không giả định chọn mã giỏi hơn thị trường; biên rộng hơn |
| Crypto | — | — | — | −75% | Không tính lợi suất kỳ vọng (biến động quá lớn) |

"Năm xấu" dùng chung `SHOCKS` của Kế hoạch giải ngân. Xem lại bảng mỗi quý.

## 2. Kiểu "Sinh lời đều mỗi năm" (kind = `return`)

Nhập: số vốn (điền sẵn tổng danh mục), mức lãi mong muốn (6–8 / 8–10 / 10–12 / trên 12%), giữ bao lâu (năm),
góp thêm mỗi tháng (tuỳ chọn).

Thang tỷ trọng (không crypto), phần cổ phiếu s = 0, 5, …, 90%:
- vàng: 0 khi s = 0, 5% khi s ≤ 20, 10% khi s ≤ 80, 5% khi s > 80; tiền gửi = phần còn lại
- cổ phiếu tự chọn: chỉ khi s ≥ 40, tối đa 25% của s (làm tròn 5); 0 nếu mới bắt đầu; tối đa 10% nếu dễ FOMO
- giữ dưới 1 năm: chỉ tiền gửi; dưới 3 năm: cổ phiếu tối đa 40% (giống khung 1–3 năm của Giải ngân)

Chọn:
- "Đạt mức mong muốn" = bậc thấp nhất có lợi suất trung bình ≥ cận dưới mức mong muốn
- "Trong mức rủi ro của bạn" = bậc cao nhất có năm xấu ≤ mức lỗ tối đa đã khai
- Kết luận: `ok` (bậc đạt mục tiêu nằm trong mức rủi ro) · `over_risk` (hiện 2 phương án, người dùng bấm chọn) ·
  `unreachable` (kể cả bậc cao nhất cũng không đạt; vẫn hiện 2 phương án) · `short_hold` (giữ dưới 3 năm)

Mỗi phương án: tỷ trọng, số tiền từng phần, lợi suất thấp / trung bình / cao, năm xấu (% và tiền),
giá trị sau N năm theo 3 mức (có góp thêm). Kèm: danh mục hiện tại đang kỳ vọng bao nhiêu (crypto không tính) và
chênh lệch so với mục tiêu. Nút: "Lập kế hoạch giải ngân" (mở /deployment điền sẵn số tiền + tỷ trọng), "Tái cân bằng".

Lưu: `targetDate` = hôm nay + số năm giữ, `targetAmount` = giá trị trung bình dự kiến của phương án đang chọn, để cố vấn,
"Cần xem lại" và các chỗ khác vẫn đọc được.

## 3. Kiểu "Có số tiền vào ngày" (kind = `amount`, mục tiêu cũ)

Giữ dữ liệu cũ. Thay ô "lợi suất giả định" tự nhập bằng tỷ trọng gợi ý theo thời gian còn lại (cùng quy tắc
`suggestMix` của Giải ngân: dưới 1 năm chỉ tiền gửi, 1–3 năm cổ phiếu ≤ 40%) và lợi suất trung bình của tỷ trọng đó;
từ đó tính số tiền cần góp mỗi tháng.

## 4. API

- `GET /goals`: mỗi mục tiêu thêm `kind`, `returnTarget`, `advice`; kèm `assumptions` (bảng §1)
- `POST /goals/preview`: tính `advice` cho một yêu cầu, không ghi
- `POST /goals/:id/choice` `{ choice: 'within' | 'target' }`
- Migration: `Goal.kind` (mặc định `amount`), `capital`, `returnMinPct`, `returnMaxPct`, `holdYears`, `riskChoice`
