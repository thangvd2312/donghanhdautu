# Kiểm soát chi phí AI (AI-01)

Bản tối thiểu gồm ghi usage và chi phí ước tính, quota phía server, ngân sách theo ngày và giới hạn kích thước hội thoại.

## Ghi usage

Mỗi lần gọi model ghi một dòng vào bảng `AiUsage` với các trường:

- người dùng;
- chức năng: `chat`, `verifier`, `brief_morning`, `brief_closing`, `brief_weekly`, `alert`, `news_tag`, `plan_draft`, `eval`;
- model, token input/output/cache;
- thời gian xử lý;
- kết quả: `ok`, `error`, `aborted`, `refused`.

Chi phí ước tính theo bảng giá có phiên bản trong [pricing.ts](../backend/src/ai/pricing.ts).

- Bảng giá mặc định là giá API trực tiếp của Anthropic, phiên bản `2026-10-06`.
- Thiếu usage (lỗi, huỷ giữa chừng) hoặc model chưa có giá thì `costUsd = null`, tức "không rõ", không tính là 0.
- Model đi qua router dùng tên khác (vd `cx/gpt-6.1-sol(high)`, `ag/gemini-3.8-flash-low`) cần khai giá trong `.env`, theo USD / 1 triệu token:

  ```
  AI_PRICES={"cx/gpt-6.1-sol(high)":{"input":1.25,"output":10},"ag/gemini-3.8-flash-low":{"input":0.3,"output":2.5}}
  ```

  Các con số trên chỉ là ví dụ, phải thay bằng giá thật của router. Khi có giá tự khai, phiên bản giá được ghi thêm hậu tố `+env`.

## Quota phía server

Mỗi lượt dùng AI do người dùng bấm được giữ chỗ trong bảng `AiRequest` trước khi gọi model. Bước kiểm tra và bước ghi nằm trong cùng một transaction có khoá theo người dùng, nên hai yêu cầu gửi cùng lúc không thể cùng lọt qua giới hạn.

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `AI_CHAT_DAILY_LIMIT` | 40 | Số câu hỏi cố vấn mỗi người mỗi ngày (giờ VN) |
| `AI_BRIEF_TEST_DAILY_LIMIT` | 3 | Số lần bấm "Gửi thử" bản tin mỗi ngày |
| `AI_PLAN_DRAFT_DAILY_LIMIT` | 20 | Số lần nhờ AI viết nháp kế hoạch mỗi ngày |
| `AI_DAILY_BUDGET_USD` | 20 | Ngân sách chung mỗi ngày cho phần chi phí tính được; `0` là không giới hạn |

- Mỗi người chỉ có một lượt chạy cùng lúc cho mỗi loại. Lượt "đang chạy" quá 10 phút được coi là đã chết, không chặn lượt mới.
- Khi hết lượt hoặc hết ngân sách, người dùng nhận thông báo tiếng Việt dễ hiểu (HTTP 429, hoặc sự kiện lỗi trong luồng chat). Danh mục, giá và cảnh báo vẫn dùng bình thường.
- Bản tin chạy nền (sáng, chiều, tuần) dừng vòng gửi khi chạm ngân sách ngày.
- Model không có giá thì chi phí không được cộng vào ngân sách. Cần khai `AI_PRICES` cho router để ngân sách có tác dụng.

## Hội thoại dài

Lịch sử chat không bị cắt bớt lượt cũ. Sửa phần đầu lịch sử làm mất hiệu lực các khối thinking đã lưu, và dễ tách rời cặp `tool_use` / `tool_result`.

- Lịch sử vượt khoảng 600.000 ký tự thì cố vấn mời người dùng mở cuộc trò chuyện mới.
- Lượt trước bị huỷ giữa lúc chạy công cụ thì hệ thống nối thêm `tool_result` báo lỗi vào cuối (chỉ nối, không sửa lịch sử) để lần gửi sau vẫn hợp lệ.

## Xem chi phí

`npm run report:usage` (trong `backend`) có thêm bảng "Chi phí AI 30 ngày qua" theo chức năng: số lượt, số lỗi, chi phí ước tính, số lượt không rõ chi phí và số người dùng.

## Chưa làm

Hàng đợi bản tin bền vững (giới hạn đồng thời, retry, xử lý lại tác vụ lỗi) chưa có. Hiện bản tin đã được chống trùng và tiếp tục được sau lỗi qua `BriefRun`, xem BRIEF-01.
