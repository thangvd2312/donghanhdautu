# Nhập tài sản bằng giọng nói

## Cách dùng

Trong **Danh mục**, chạm nút mic nổi (kiểu nút home ảo: kéo đi đâu cũng được, thả ra tự bám mép trái/phải và nhớ vị trí, mờ đi sau vài giây không dùng). Bấm **Bấm để nói**, nói tiếng Việt rồi dừng. Chữ hiện ngay trong ô nội dung; có thể sửa hoặc gõ/dán thay thế. Bấm **Phân tích tài sản**, kiểm tra từng dòng (số hiện theo kiểu Việt Nam: `50.000.000`, `0,05`; mỗi dòng có **Tổng vốn** = số lượng × giá vốn để soát lỗi đơn vị), bổ sung chỗ thiếu — dòng chữ cam ở chân màn hình đưa tới tài sản còn thiếu — hoặc **Thêm tài sản AI bỏ sót**, chọn danh mục và ngày bắt đầu theo dõi. Bấm **Xem trước khi lưu**, kiểm tra tác động trước/sau, rồi **Xác nhận nhập**.

Ví dụ: “Tôi đang có 100 cổ phiếu FPT, giá vốn 100 nghìn một cổ, và 50 triệu tiền mặt.” Có thể khai báo nhiều loại trong một câu: cổ phiếu, crypto, vàng, tiền mặt VND. Không dùng luồng này để ra lệnh mua/bán hoặc thay số dư đã có. Những dòng được xác nhận sẽ cộng thêm số dư đầu kỳ; có thể hoàn tác theo đợt trong **Sổ giao dịch → Nhập CSV**.

## Giới hạn bản đầu

- Nhận tiếng Việt bằng `SpeechRecognition`/`webkitSpeechRecognition`, tối đa 60 giây mỗi lượt và 4.000 ký tự. Có đồng hồ đếm khi đang nghe. Android Chrome ở chế độ `continuous` lặp lại câu trước trong mỗi kết quả; phần ghép chữ chỉ giữ bản dài nhất. Trình duyệt không hỗ trợ hoặc không cho phép mic vẫn cho nhập chữ. Mic chỉ bắt đầu khi người dùng bấm và bị ngắt khi đóng màn hình.
- Mức hỗ trợ và cách xử lý âm thanh phụ thuộc trình duyệt; một số trình duyệt gửi âm thanh tới dịch vụ nhận giọng nói. Ứng dụng không lưu audio. Nội dung chữ được gửi tới AI hiện được cấu hình khi người dùng bấm Phân tích. [Tài liệu SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- AI trả bản nháp tối đa 20 tài sản. Chưa rõ loại/mã/số lượng/giá vốn thì để trống và yêu cầu người dùng xác nhận. Giá coin là USDT/coin; giá vàng là VND/lượng. Thiếu giá vốn không tự dùng giá hiện tại hoặc giá 0. Loại vàng phải chọn đúng sản phẩm trong danh sách.
- Kết quả AI có thể nghe/hiểu sai con số, mã hoặc đơn vị. Các trường tiền và đơn vị luôn cần người dùng kiểm tra. Chuyển đổi chỉ/lượng và ngôn ngữ tự nhiên nằm trong bước trích xuất AI, chưa có đánh giá chất lượng bằng model thật ở lượt triển khai này.
- Khai báo số dư đầu kỳ không dựng lại lịch sử mua bán. Dữ liệu mới được cộng thêm; chống trùng theo đợt và theo giao dịch giống hệt không có nghĩa là tự nhận ra mọi lần khai báo lặp lại khác ngày/khác số tiền.

## Hợp đồng và vận hành

`POST /api/holding-drafts` cần JWT, nhận `{ "text": "..." }`. Hợp đồng dùng chung ở [holding-draft.ts](../contracts/src/holding-draft.ts). Phản hồi là `rows` và `warnings`; không ghi sổ. Có ghi quota/usage AI. Nội dung chữ không được lưu vào ghi chú giao dịch.

Lỗi: 400 khi đầu vào không hợp lệ; 401 khi chưa đăng nhập; 429 khi hết quota; 503 khi AI tắt/lỗi hoặc dữ liệu trả về không hợp lệ. Dùng cấu hình LLM hiện có, tính usage theo `holding_draft`, giới hạn mặc định 20 lần/ngày/người; có thể đặt `AI_HOLDING_DRAFT_DAILY_LIMIT`. Không cần migration.

Lưu dùng lại import preview/commit hiện có. Phần xem trước kiểm tra mã, quyền sở hữu danh mục, lỗi sổ và dòng nghi trùng. UI chỉ cho xác nhận khi không còn dòng lỗi; dòng nghi trùng được bỏ qua. Retry cùng yêu cầu dùng cơ chế chống trùng theo đợt hiện có.

## Bằng chứng kiểm tra

Ngày 28/10/2026 (lượt chỉnh UI): sửa lỗi số thập phân 3 chữ số (`1.234` BTC từng bị hiểu thành 1234 coin) bằng bộ đọc số riêng cho bản nháp. 49 test frontend, lint, build đạt; chạy lại kịch bản Postman + PostgreSQL + WebKit bên dưới: PASS.

Ngày 28/10/2026: kiểm kiểu, build frontend/backend và lint đạt; 769 unit test backend và 44 test frontend đạt. [Kịch bản Postman + PostgreSQL + WebKit](../postman/simulations/holding-voice.context.md) đã kiểm tra luồng từ mic giả lập đến lưu bản sửa, retry và undo. Không thay đổi hoặc thử trên dữ liệu production.

Trước khi phát hành cần nghiệm thu mic thật trên thiết bị người dùng và model AI đang cấu hình: giọng vùng miền; mã đọc từng chữ; một câu chứa nhiều tài sản; “phẩy/rưỡi/nghìn/triệu/tỷ”; vàng chỉ/lượng; giá vốn tổng so với đơn giá; câu đính chính; lời nói thiếu giá vốn; ngoại tệ chưa hỗ trợ. Kiểm tra từ chối quyền mic, mất mạng, đóng giữa lúc nói và mở lại.
