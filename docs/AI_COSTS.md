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
- Model đi qua router dùng tên khác nên giá được khai trong `.env` (USD / 1 triệu token). Router có thể đổi tên model khi trả lời (gọi `ag/gemini-3.8-flash-low` nhưng phản hồi ghi `gemini-3.8-flash-n`). Hệ thống tra giá theo tên trả về trước, không có thì tra theo tên đã cấu hình, nên chỉ cần khai theo tên trong `LLM_MODEL_*`.

  Production đang dùng giá niêm yết chính thức của model gốc, khai ngày 21/10/2026:

  ```
  AI_PRICES={"cx/gpt-6.1-sol(high)":{"input":2,"output":10,"cacheRead":0.1},"ag/gemini-3.8-flash-low":{"input":0.75,"output":3.75,"cacheRead":0.075}}
  ```

  - GPT-6.1 Sol: giá chuẩn $2 / $10, cache $0,10. Prompt trên 272K token có giá cao hơn nhưng app không dùng tới.
  - Gemini 3.8 Flash: giá ưu đãi $0,75 / $3,75 tới 31/12/2026; từ 1/1/2027 tăng lên $1,50 / $7,50, **cần cập nhật `AI_PRICES` lúc đó**.
  - Đây là giá tham chiếu. Chi phí thật qua 9router có thể khác (router của công ty, có thể tính theo gói), nên số liệu là ước tính để so sánh giữa các chức năng và đặt ngân sách. Khi có giá thực của router thì thay vào. Phiên bản giá được ghi thêm hậu tố `+env`.

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

## Hàng đợi bản tin

Cron bản tin sáng, chiều và tuần không tự tạo bản tin. Nó chỉ xếp mỗi người nhận một việc vào bảng `BriefJob`. Khoá duy nhất (người, loại, ngày) nên xếp lại hoặc chạy cron hai lần không tạo trùng.

- **Worker:** mỗi tiến trình chạy tối đa `BRIEF_CONCURRENCY` việc cùng lúc (mặc định 3). Việc được lấy bằng `FOR UPDATE SKIP LOCKED`, nên nhiều tiến trình không lấy trùng việc của nhau. Hàng đợi được quét 15 giây một lần, và chạy ngay khi có việc mới.
- **Thử lại:** việc lỗi được thử lại sau 2, 4, 8 phút; quá 4 lần thì chuyển sang `failed`, có ghi lỗi.
- **Server khởi động lại:** việc "running" quá 15 phút được đưa lại vào hàng đợi.
- **Hết hạn:** bản tin sáng/chiều quá 6 giờ, bản tin tuần quá 2 ngày thì bỏ (`skipped`), không gửi muộn.
- **Ngân sách AI:** đã chạm ngân sách ngày thì việc được hoãn 30 phút và không tính là một lần thử.
- **Không trùng nội dung:** việc chống trùng do `BriefRun` đảm nhiệm. Thử lại sau lỗi thì dùng lại cuộc trò chuyện đã lưu, không gọi lại AI.

Xem và chạy lại, trong thư mục `backend` trên server:

```bash
npm run briefs:jobs                   # thống kê 7 ngày + các việc lỗi
npm run briefs:jobs -- retry failed   # đưa mọi việc lỗi về hàng đợi
npm run briefs:jobs -- retry <id>     # chạy lại một việc
```
