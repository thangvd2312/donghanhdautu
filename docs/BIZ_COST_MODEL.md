# Hỗ trợ kỹ thuật cho BIZ-01 (gói trả phí)

BIZ-01 là việc của product: phỏng vấn người dùng, chọn quyền lợi, đặt giá, xác định tiêu chí thành công. Tài liệu này ghi các số liệu và cơ chế kỹ thuật đã có, để product dùng khi chốt.

## Số liệu đã đo được

Chạy `npm run report:usage` trong `backend` trên server:

| Câu hỏi của product | Bảng trong báo cáo |
|---|---|
| Bao nhiêu người kích hoạt, quay lại D7/D30? | Cohort theo tuần đăng ký |
| Người dùng có đọc và hỏi tiếp bản tin không (ứng viên quyền lợi trả phí)? | Bản tin 30 ngày: tỷ lệ mở, tỷ lệ hỏi tiếp |
| Tính năng nào được dùng nhiều? | Sự kiện 30 ngày (hỏi cố vấn, lập / xem lại kế hoạch, nhập CSV…) |
| Mỗi tính năng tốn bao nhiêu tiền AI? | Chi phí AI theo chức năng |
| Một người dùng tốn bao nhiêu mỗi tháng? | Chi phí AI trên mỗi người dùng: trung bình, trung vị (p50), p90, cao nhất; cộng phần chi phí chung chia đều |

Chi phí chỉ tính được khi model có giá. Model đi qua router cần khai `AI_PRICES` (xem [AI_COSTS.md](AI_COSTS.md)); nếu không, các lượt gọi được tính vào cột "không rõ chi phí".

## Cách ước tính chi phí một người dùng / tháng

```
chi phí AI / người ≈ p50 (người dùng thường) hoặc p90 (người dùng nhiều) + chi phí chung / người hoạt động
chi phí khác / người ≈ (server + dữ liệu thị trường + tên miền) / số người hoạt động trong tháng
```

So mức này với giá dự kiến của từng gói. Cần ít nhất 4 tuần số liệu sau khi triển khai đo lường thì con số mới ổn định.

## Giới hạn gói có thể thực thi phía server

Quota hiện áp chung cho mọi người qua biến môi trường:

- `AI_CHAT_DAILY_LIMIT`: số câu hỏi cố vấn mỗi ngày;
- `AI_BRIEF_TEST_DAILY_LIMIT`: số lần gửi thử bản tin mỗi ngày;
- `AI_PLAN_DRAFT_DAILY_LIMIT`: số bản nháp kế hoạch mỗi ngày;
- `AI_DAILY_BUDGET_USD`: ngân sách chung mỗi ngày.

Việc kiểm tra quota là nguyên tử, xem [ai-usage.service.ts](../backend/src/ai/ai-usage.service.ts). Khi product chốt gói, chỉ cần thêm gói của người dùng (ví dụ trường `plan` trên `User`) và lấy giới hạn theo gói thay cho giới hạn chung. Cơ chế giữ chỗ và đếm lượt giữ nguyên.

## Product cần chốt trước khi làm thanh toán

1. Quyền lợi nào thu phí, kèm bằng chứng nhu cầu từ phỏng vấn và số liệu sử dụng ở trên.
2. Giới hạn của gói miễn phí và gói trả phí cho từng quota ở trên.
3. Giá và tiêu chí thành công của đợt thử nghiệm: tỷ lệ chuyển đổi, tỷ lệ huỷ, biên lợi nhuận.
4. Cổng thanh toán (cần chọn nhà cung cấp; đây là quyết định kỹ thuật có chi phí, cần hỏi trước).
5. Không quảng bá quyền lợi chưa có như thể đã sẵn sàng.
