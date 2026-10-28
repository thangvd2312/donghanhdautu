# Định hướng sản phẩm và gợi ý kế hoạch / mục tiêu

Ngày: 28/10/2026. Trạng thái: đề xuất sản phẩm để thảo luận, chưa triển khai.

## 1. Kết luận

Ưu tiên chu trình **hiểu hoàn cảnh → chọn mục tiêu → lập kế hoạch → thực hiện → xem lại**. Sản phẩm đã có nhiều công cụ; đợt tới nên giúp người dùng biết việc gì đáng làm tiếp theo và hoàn thành việc đó ngay trong ứng dụng.

Nên phát triển gợi ý kế hoạch và mục tiêu, tận dụng các phần hiện có. Bắt đầu bằng quy tắc có thể giải thích và phép tính xác định; dùng AI để hỗ trợ diễn đạt, viết nháp khi cần. Chưa cần huấn luyện mô hình gợi ý riêng.

Phạm vi đánh giá: đọc mã nguồn, contracts, schema và tài liệu bàn giao trong checkout hiện tại. Chưa chạy nghiệm thu ứng dụng hoặc đọc số liệu người dùng thật. Đánh giá giá trị và thứ tự ưu tiên bên dưới là giả thuyết cần kiểm chứng. Các lỗi trong review cũ không được mặc định là còn tồn tại; báo cáo bàn giao ghi nhận nhiều lỗi đã sửa.

## 2. Nền tảng đã có và khoảng trống

| Mảng | Đã có trong mã nguồn | Cơ hội cải tiến |
|---|---|---|
| Hồ sơ | Khẩu vị rủi ro, thời hạn, mức chịu lỗ, FOMO; câu trả lời có thông tin đã có quỹ dự phòng hay chưa | Thiếu dữ liệu định lượng về ngân sách góp, chi tiêu, nghĩa vụ nợ và tiền cần dùng sớm |
| Kế hoạch | Kế hoạch theo mã, AI viết nháp, điều kiện xem lại, lịch nhắc, phiên bản, nhật ký | Chủ động mời lập kế hoạch cho tài sản chưa có; viết nháp theo mục tiêu cụ thể |
| Mục tiêu | Số tiền, thời hạn, phần tài sản được gán, mô phỏng mức góp/lợi suất, trạng thái | Hướng dẫn tạo mục tiêu, ưu tiên nhiều mục tiêu, kiểm tra tổng khả năng góp |
| Trang Hôm nay | Các điểm cần xem lại về danh mục, kế hoạch, giá, sự kiện quyền | Bổ sung mục tiêu và hành động tiếp theo vào cùng một nơi; tránh tạo luồng cảnh báo trùng |
| Công cụ hỗ trợ | Mô phỏng, tái cân bằng, nhật ký, báo cáo, thông báo | Liên kết vào đúng bước người dùng cần, thay vì yêu cầu họ tự tìm công cụ |
| Đo lường | Sự kiện tạo/xem lại kế hoạch, hoạt động ứng dụng, bản tin, chi phí AI | Bổ sung phễu gợi ý và mục tiêu; chưa có bằng chứng trong lần đọc này về hiệu quả thực tế |

Hai khái niệm phải rõ trên giao diện:

- **Mục tiêu tài chính:** cần bao nhiêu tiền, vào lúc nào, ưu tiên ra sao.
- **Kế hoạch đầu tư:** vì sao giữ một tài sản, khi nào cần xem lại, liên quan tới mục tiêu nào.

Hiện `InvestmentPlan` và `Goal` chưa có quan hệ trực tiếp trong schema. Không phải mục tiêu nào cũng cần một kế hoạch theo mã: mục tiêu tích lũy tiền mặt có thể chỉ cần lịch góp và lịch xem lại.

## 3. MVP: “Gợi ý dành cho bạn”

Đặt tối đa 3 thẻ hành động trong trang Hôm nay, dùng chung cách ưu tiên với khối “cần xem lại”. Trang Mục tiêu và Kế hoạch có gợi ý theo ngữ cảnh. Mỗi thẻ phải cho biết: việc được đề xuất, lý do, dữ liệu/giả định, thời điểm cập nhật và một hành động chính.

| Tình huống | Gợi ý | Hành động |
|---|---|---|
| Chưa có mục tiêu | Chọn điều bạn muốn dành tiền cho; cung cấp mẫu tích lũy, khoản chi sắp tới, dự phòng | Chọn mẫu và nhập số tiền/thời hạn; không tự đoán người dùng muốn mua nhà |
| Khảo sát trước đây cho biết chưa có dự phòng | Xác nhận tình trạng hiện tại và bổ sung chi tiêu nếu muốn lập mục tiêu | Tạo bản nháp từ dữ liệu vừa xác nhận; không mặc định câu trả lời cũ vẫn đúng |
| Có tài sản nhưng chưa có kế hoạch đang hoạt động | Ghi lý do nắm giữ và điều kiện xem lại | Mở bản nháp có sẵn ngữ cảnh, sửa rồi lưu |
| Mục tiêu chưa đủ theo giả định | So sánh tăng mức góp, kéo dài thời hạn, giảm số tiền đích | Xem tác động trước/sau, chọn rồi lưu |
| Kế hoạch đến hạn | Xem lại lý do nắm giữ và thay đổi liên quan | Giữ / điều chỉnh / kết thúc trong luồng hiện có |

Luồng: **gợi ý → xem lý do → xem/sửa bản nháp → xác nhận lưu → theo dõi → xem lại**.

Cho phép “Để sau”, “Không phù hợp”, “Đã xử lý ngoài ứng dụng”. Tạm ẩn gợi ý theo lựa chọn; chỉ hiện lại khi hết thời gian hoãn hoặc dữ liệu thay đổi đáng kể. Việc xem hoặc bấm mở không được tính là đã hoàn thành.

Ví dụ minh họa phép tính, không phải đề xuất đầu tư: người dùng tự đặt đích 120 triệu sau 12 tháng, có 30 triệu được gán và dự định góp 5 triệu/tháng. Với giả định lợi suất 0%, dự kiến đạt 90 triệu, còn thiếu 30 triệu. Ba phương án là góp 7,5 triệu/tháng, giữ mức góp và kéo dài thành 18 tháng, hoặc giảm đích xuống 90 triệu. Chỉ gọi phương án tăng góp là khả thi khi người dùng xác nhận ngân sách phù hợp.

## 4. Dữ liệu cần bổ sung

Thu thập theo ngữ cảnh, không kéo dài khảo sát ban đầu bằng tất cả câu hỏi tài chính.

- Bắt buộc khi kiểm tra khả thi: ngân sách có thể góp mỗi tháng do người dùng xác nhận; cho phép chưa biết.
- Khi tạo mục tiêu: ưu tiên, mức linh hoạt của ngày đích và số tiền đích.
- Khi lập mục tiêu dự phòng: chi tiêu thiết yếu, khoản dự phòng đã có kể cả ngoài ứng dụng, số tháng mong muốn.
- Khi cần đánh giá sâu hơn: thu nhập ổn định hay biến động, nghĩa vụ trả nợ, khoản chi lớn sắp tới. Không cần thu thập chi tiết nếu chưa phục vụ hành động cụ thể.
- Mọi dữ liệu tự khai cần ngày cập nhật. Chưa khai báo không được hiểu là bằng 0.

Đặc biệt: tổng mức góp của các mục tiêu đang hoạt động phải được đối chiếu với **một ngân sách chung**. Kiểm tra này khác với giới hạn gán tối đa 100% mỗi tài sản đang có.

Tiến độ theo giá trị tài sản không đồng nghĩa với đã góp đều. Chỉ thông báo “tháng này bạn chưa góp” khi đã có cách ghi nhận hoặc liên kết khoản góp đáng tin cậy; không suy ra từ biến động giá trị danh mục.

## 5. Vai trò của quy tắc và AI

Quy tắc quyết định điều kiện xuất hiện, ưu tiên và khả năng thực hiện. Phép tính hiện có tính số tiền, khoảng thiếu và các phương án. AI diễn giải lý do và hỗ trợ viết nháp từ dữ liệu đã được cung cấp.

- Thiếu dữ liệu thiết yếu: đề nghị bổ sung, không tự điền hoàn cảnh của người dùng.
- Giá thiếu/cũ: ghi rõ chất lượng; không đưa kết luận chắc chắn hoặc gợi ý định lượng phụ thuộc vào giá đó.
- Hiển thị lợi suất là giả định có thể sửa; không âm thầm dùng mặc định 6% như một dự báo cá nhân hóa.
- Không giải quyết mục tiêu thiếu tiền bằng cách tự nâng lợi suất kỳ vọng hoặc chuyển sang tài sản rủi ro hơn.
- Mốc tiền/giá cần được tính và kiểm tra bằng code; không chỉ dựa vào chỉ dẫn trong prompt. Hiện prompt bản nháp có yêu cầu AI tự tính mốc cắt lỗ, nên đây là phần nên rà soát khi mở rộng.
- AI lỗi hoặc hết quota: vẫn có thẻ gợi ý theo quy tắc, mẫu điền tay và phép tính.
- Trước lúc lưu, kiểm tra lại dữ liệu vì tài sản hoặc ngân sách có thể đã thay đổi từ lúc tạo gợi ý. Không tự sửa mục tiêu, kế hoạch hoặc ghi giao dịch thật.

## 6. Thứ tự phát triển

Ước lượng dưới đây là khung lập kế hoạch cho một lập trình viên toàn thời gian, cần điều chỉnh theo chất lượng hiện tại và kết quả dùng thử; không phải cam kết giao hàng.

| Đợt | Thời lượng tham khảo | Kết quả cần có | Điều kiện chuyển bước |
|---|---|---|---|
| 0. Kiểm chứng nhu cầu | 3–5 ngày | Xem số liệu hiện có; quan sát 5–8 người tạo mục tiêu/kế hoạch; xác định chỗ bỏ cuộc | Chốt được nhóm người dùng và khó khăn ưu tiên; có số đo ban đầu hoặc ghi rõ chưa đủ mẫu |
| 1. Gợi ý hành động | 1–2 tuần | Thẻ trên Hôm nay, mời lập kế hoạch cho tài sản chưa có, mẫu mục tiêu, để sau/bỏ qua, đo phễu | Hoàn thành từ thẻ đến lưu được; không tạo trùng; AI tắt vẫn dùng được |
| 2. Mục tiêu khả thi | 1–2 tuần | Ngân sách góp chung, ưu tiên mục tiêu, so sánh mức góp/thời hạn/số tiền | Phương án không dùng vượt ngân sách hoặc phân bổ trùng tài sản; thiếu dữ liệu được nói rõ |
| 3. Liên kết và theo dõi | 1–2 tuần | Liên kết kế hoạch với mục tiêu; lịch xem lại; ghi nhận góp và thay đổi tiến độ | Phân biệt được tiền góp với biến động thị trường; sửa mục tiêu không làm mất lịch sử |
| 4. Cá nhân hóa sâu | Sau khi đủ dữ liệu | Điều chỉnh thứ tự gợi ý theo phản hồi và hành vi; đưa tổng kết vào bản tin | Có bằng chứng tăng hành động hữu ích và giữ chân, chi phí phù hợp |

Ưu tiên triển khai đợt 1 trước khi mở rộng AI cho toàn bộ mục tiêu. Liên kết kế hoạch–mục tiêu ở đợt 3 cần chốt rõ trường hợp một tài sản phục vụ nhiều mục tiêu, tránh mặc định một-một.

## 7. Cải tiến sản phẩm đi kèm

1. **Giảm công sức bắt đầu:** điền sẵn dữ liệu đã biết, tạo mục tiêu từ mẫu hoặc từ số 0; chưa có tài sản vẫn có thể lập dự định.
2. **Tập trung trang Hôm nay:** ưu tiên việc đến hạn và việc ảnh hưởng mục tiêu; gộp thông báo cùng vấn đề, không chồng thêm một bảng cảnh báo độc lập.
3. **Giải thích thay đổi:** mục tiêu tăng/giảm do góp thêm, rút tiền, giá tài sản hay đổi phần phân bổ. Làm sau khi dữ liệu truy vết đủ.
4. **Kiểm tra trải nghiệm thực:** dùng thử trên điện thoại, quan sát người mới hiểu “gán tài sản”, “mức góp dự định” và “đúng hướng theo giả định” như thế nào.
5. **Đo giá trị trước khi mở rộng:** chưa ưu tiên thêm bảng giá, chỉ báo, mạng xã hội hoặc gói trả phí trong đợt này. Tài liệu bàn giao hiện ghi hướng phát triển miễn phí.

## 8. Đo lường và nghiệm thu

Chỉ số chính đề xuất: tỷ lệ người dùng được hiển thị gợi ý thực hiện ít nhất một hành động hữu ích trong 7 ngày (lưu mục tiêu, lưu kế hoạch, hoàn tất xem lại). Tách từng loại hành động; không coi lượt bấm là thành công.

Đo thêm: hiển thị → mở → lưu; thời gian đến mục tiêu đầu tiên; tỷ lệ quay lại cập nhật/xem lại sau 4 tuần; tỷ lệ bỏ qua/hoãn; phản hồi không phù hợp; chi phí AI trên mỗi hành động hoàn tất. Chỉ tính các nhóm đã có đủ thời gian quan sát. Với ít người dùng, ưu tiên phỏng vấn và quan sát trước khi kết luận thống kê.

Trước phát hành cần thử các trường hợp: người mới chưa có tài sản; hồ sơ thiếu/cũ; hai mục tiêu cùng dùng một ngân sách; tài sản đã được gán hết; mục tiêu quá hạn/tạm dừng/đã đạt; giá thiếu/cũ; gợi ý bị bỏ qua; lưu lại hoặc bấm hai lần; dữ liệu thay đổi trước khi lưu; AI không hoạt động. Kiểm tra cả phép tính, lưu dữ liệu và luồng điện thoại.

Chưa đặt ngưỡng chuyển đổi hay giữ chân tuyệt đối khi chưa có số đo ban đầu. Chốt mục tiêu thử nghiệm sau đợt 0, rồi so với nhóm/đợt sử dụng tương đương.

## 9. Căn cứ trong repository

- [Khảo sát hồ sơ](../backend/src/profile/quiz.ts).
- [Schema kế hoạch và mục tiêu](../backend/prisma/schema.prisma).
- [Dịch vụ viết nháp kế hoạch](../backend/src/plans/plan-draft.service.ts) và [prompt](../backend/src/plans/plan-draft.prompt.ts).
- [Dịch vụ mục tiêu](../backend/src/goals/goals.service.ts), [phép tính](../backend/src/goals/goal-math.ts), [giao diện mục tiêu](../frontend/src/components/goals/GoalCard.tsx).
- [Điểm cần xem lại trên Hôm nay](../backend/src/home/home-review.service.ts).
- [Sự kiện đo lường](../backend/src/analytics/events.ts).
- [Báo cáo bàn giao](DEV_REPORT_2026-10.md).
