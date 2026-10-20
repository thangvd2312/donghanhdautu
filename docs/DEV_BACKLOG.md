# Backlog bàn giao cho dev

- Ngày lập: 20/10/2026.
- Liên quan: [định hướng sản phẩm và roadmap](PRODUCT_ROADMAP.md).
- Trạng thái (cập nhật tối 20/10/2026, sau khi sửa các điểm trong review). Mức: **code** = đã có code; **tự động** = có unit test và/hoặc test tích hợp PostgreSQL trong CI; **luồng thật** = đã nghiệm thu trên môi trường thật.

| Hạng mục | Mức | Ghi chú |
|---|---|---|
| DATA-01 | tự động | Giá hôm nay cũ / dự phòng và tỷ giá ước tính được giữ trạng thái tới lịch sử và báo cáo kỳ. Coin có hai con số: lãi theo USDT và lãi VND thực tế theo tỷ giá lúc mua |
| OBS-01 | tự động, đang chạy production | Bảng `AnalyticsEvent`, `npm run report:usage`: kích hoạt, D7/D30, bản tin, thời gian tới giá trị đầu tiên, duy trì nhật ký, chất lượng dữ liệu / AI, chi phí AI ([ANALYTICS.md](ANALYTICS.md)) |
| AI-01 | tự động, đang chạy production | Usage + chi phí (`AI_PRICES` đã khai), quota, ngân sách, trần hội thoại dài, hàng đợi bản tin; test cả luồng chat ([AI_COSTS.md](AI_COSTS.md)) |
| QA-01 | tự động | CI chạy unit + test tích hợp PostgreSQL. Audit mobile fail khi có lỗi; đủ 44 màn hình (kể cả cần đăng nhập, dùng tài khoản `npm run seed:e2e`) đều đạt. Đã tách bundle và đo tải trang ([PERFORMANCE.md](PERFORMANCE.md)) |
| WL-01 | tự động | Giới hạn số mã giữ đúng khi thêm đồng thời |
| ACQ-01 | tự động | Khảo sát có nút "Để sau"; giữ trang đích qua đăng ký và khảo sát; đo phễu trang mẫu |
| PF-01 | tự động + đối soát production | Kiểm tra ngày có thật; nhận cổ phiếu thưởng / chia tách; gợi ý sự kiện quyền chưa ghi theo Vietcap. Đối soát Holding với sổ trên production: "Khớp" |
| PF-02 | tự động | Gửi lại cùng yêu cầu nhập không tạo thêm giao dịch; xem trước không ghi DB |
| PF-03 | tự động | Lịch sử dùng giá đóng cửa gốc (VNDirect); thiếu giá ngày khai báo thì kết quả kỳ là ước tính. TWR/XIRR, benchmark để sau |
| HOME-01 | tự động | Tăng/giảm hôm nay tính theo vị thế đầu ngày và giao dịch trong ngày |
| BRIEF-01 | tự động | Mỗi người một bản tin mỗi kỳ (`BriefRun`, hàng đợi `BriefJob`); số AI viết được đối chiếu với số đã tính; đo lượt mở và hỏi tiếp |
| PLAN-01 | tự động | Giao dịch được ghi rõ là trước / trong / sau thời gian kế hoạch |
| NT-01 | tự động | Thông báo và việc gửi được lưu cùng transaction; test giao thức Telegram / Web Push với server giả ([NOTIFICATIONS_TEST.md](NOTIFICATIONS_TEST.md)). Còn bước thử trên thiết bị thật ở production |
| GOAL-01 | tự động | Phân bổ không vượt 100% khi tạo/sửa đồng thời |
| BIZ-01 | chưa (phần product) | Đã có số liệu và cơ chế hỗ trợ: chi phí AI mỗi người, quota thực thi được ([BIZ_COST_MODEL.md](BIZ_COST_MODEL.md)). Còn phỏng vấn, giá, tiêu chí thử nghiệm |
- Các lựa chọn dưới đây là phạm vi đề xuất. Khi chia ticket, dev ghi rõ quyết định kỹ thuật, phụ thuộc và phần được hoãn.

## Quy ước triển khai

- Giữ kiến trúc hiện tại và mở rộng theo module; chưa có yêu cầu viết lại hệ thống.
- Chia PR theo hạng mục có thể nghiệm thu độc lập.
- Với tính toán tài sản, dùng logic xác định và test số liệu; AI chỉ diễn giải kết quả đã tính.
- Tách dữ liệu thực, dữ liệu thiếu, dữ liệu mẫu và giả định trong cả lưu trữ lẫn giao diện.
- Dữ liệu cũ phải có đường chuyển đổi, đối soát và phương án khôi phục trước khi thay đổi mô hình tính toán.
- Các chức năng cá nhân phải kiểm tra quyền sở hữu ở backend; không dựa vào việc ẩn nút trên giao diện.
- Mỗi ticket cần có phạm vi, tiêu chí nghiệm thu, kiểm tra phù hợp và ghi chú thay đổi dữ liệu.
- Các mục “cần chốt” là quyết định của product/dev trước phần việc phụ thuộc; không ngăn cản triển khai các phần độc lập.

## DATA-01 — Định giá minh bạch và độ mới dữ liệu

**Ưu tiên:** P0. **Phụ thuộc:** không.

**Hiện trạng:** tổng danh mục dùng giá vốn khi thiếu giá thị trường; crypto quy cả vốn và giá hiện tại theo tỷ giá hiện tại. `snapshot.updatedAt` là thời điểm tạo phản hồi, không phải thời điểm dữ liệu nguồn mới nhất.

**Phạm vi:**

- Tách giá trị đã định giá được và phần chưa có giá; nếu dùng giá vốn ước tính, ghi rõ giá trị và phương pháp.
- Ghi/hiển thị thời điểm dữ liệu nguồn, lần lấy thành công, nguồn và trạng thái dự phòng.
- Xác định quy tắc dữ liệu cũ theo loại tài sản và phiên giao dịch.
- Phân biệt lợi nhuận theo đồng tiền gốc với lợi nhuận VND khi đã có tỷ giá giao dịch.
- Hiển thị trạng thái thiếu dữ liệu cả ở danh mục, dashboard và ngữ cảnh đưa cho AI.

**Nghiệm thu:**

- Một tài sản mất giá thị trường không bị trình bày như đã định giá đầy đủ hoặc chắc chắn hòa vốn.
- Nguồn lỗi nhưng còn cache phải thể hiện tuổi dữ liệu; ngoài phiên không mặc nhiên bị coi là lỗi.
- Không có tỷ giá lịch sử thì không suy ra lợi nhuận VND thực tế từ ngày mua.
- Không hiển thị tỷ giá mặc định như giá vừa lấy được từ một nguồn đang hoạt động.
- Có test cho thiếu một phần giá, toàn bộ giá, tỷ giá dự phòng và dữ liệu cũ.

**Điểm sửa dự kiến:** market service/types, portfolio service, kiểu dữ liệu frontend và các trang hiển thị.

## OBS-01 — Đo hành vi sử dụng

**Ưu tiên:** P0. **Phụ thuộc:** không.

**Phạm vi:** định nghĩa sự kiện cho đăng ký, hoàn thành khảo sát, thêm tài sản thật đầu tiên, hoàn tất nhập dữ liệu, xem danh mục, mở bản tin, hỏi tiếp và xem lại kế hoạch.

**Nghiệm thu:**

- Có từ điển sự kiện: tên, thời điểm phát, thuộc tính, nguồn phát và cách chống ghi trùng.
- Phân biệt hành vi trên danh mục mẫu và dữ liệu thật.
- Tính được kích hoạt, D7/D30, tương tác bản tin và số người dùng hoạt động.
- Không đưa token, nội dung chat, ghi chú đầu tư, email hoặc giá trị danh mục vào sự kiện phân tích mặc định.
- Có màn hình hoặc truy vấn báo cáo tái sử dụng; không bắt buộc xây dashboard quản trị lớn.

**Cần chốt:** công cụ đo lường, chính sách lưu giữ và định nghĩa cohort.

## AI-01 — Kiểm soát chi phí và vận hành AI

**Ưu tiên:** P0 trước khi tăng mạnh số người dùng. **Phụ thuộc:** không.

**Phạm vi:**

- Ghi usage theo người dùng, chức năng, model, thời gian xử lý và kết quả.
- Tính chi phí ước tính theo cấu hình giá có phiên bản; thiếu usage phải ghi “không rõ”, không coi là 0.
- Giới hạn lượt gọi, mức đồng thời và ngân sách bằng kiểm tra phía server.
- Thiết kế xử lý lịch sử chat dài, bảo toàn cặp tool-use/tool-result và cấu trúc hội thoại hợp lệ.
- Chuyển tác vụ bản tin sang hàng đợi có giới hạn đồng thời, thử lại có giới hạn và chống trùng.
- Có thống kê lỗi và khả năng xử lý lại tác vụ thất bại.

**Nghiệm thu:**

- Biết chi phí ước tính của chat, bản tin, cảnh báo và verifier riêng biệt.
- Hai yêu cầu đồng thời không vượt quota do cùng đọc số dư cũ.
- Nút gửi thử bản tin và tác vụ nền cũng chịu giới hạn thích hợp.
- Khi hết quota, người dùng nhận thông báo dễ hiểu; dữ liệu danh mục vẫn dùng được.
- Khởi động lại hoặc retry không tạo nhiều bản tin/thông báo cho cùng sự kiện và người dùng.
- Có tình huống kiểm tra hội thoại dài, hủy chat, lỗi model và lỗi worker.

**Ghi chú:** code đã có phân tầng model `brief`/`fast`; mở rộng từ cơ chế này.

## QA-01 — Bổ sung kiểm tra vào CI và đo tải trang

**Ưu tiên:** P0 cho CI; P1 cho tối ưu tải trang. **Phụ thuộc:** không.

**Phạm vi:** đưa unit test sẵn có vào CI; bổ sung test nghiệp vụ cùng các tính năng mới; đo tải trang trước khi tách bundle theo trang/chức năng.

**Nghiệm thu:**

- CI thất bại khi unit test thất bại, bên cạnh typecheck/build.
- Các phép tính danh mục, nhập giao dịch, quyền sở hữu và chống trùng có kiểm tra phù hợp.
- Có số đo bundle và tải trang trước/sau nếu tối ưu frontend; không chỉ tăng ngưỡng cảnh báo để che vấn đề.
- Có hướng dẫn kiểm tra luồng chính và rollback trong PR thay đổi dữ liệu.
- Phân biệt unit test, kiểm thử luồng người dùng và eval AI; không coi build thành công là đã kiểm chứng AI.

## WL-01 — Hoàn thiện watchlist

**Ưu tiên:** P1, có thể làm sớm. **Phụ thuộc:** DATA-01 cho trạng thái giá.

**Phạm vi:** dùng `WatchItem` hiện có; thêm/xóa tài sản theo dõi, hiển thị giá, trạng thái dữ liệu và liên kết sang trang chi tiết/đặt cảnh báo.

**Nghiệm thu:**

- Người dùng theo dõi được tài sản chưa sở hữu mà không tạo holding.
- Thêm cùng một tài sản hai lần không tạo bản ghi trùng.
- Không đọc/sửa danh sách của người khác.
- Tài sản chưa có trang chi tiết được xử lý rõ; mã không hợp lệ có thông báo.
- Mã cổ phiếu trong watchlist được cập nhật giá và vẫn còn sau đăng nhập lại.

**Cần chốt:** tập loại tài sản hỗ trợ ở phiên bản đầu; không mặc định hỗ trợ mọi loại.

## ACQ-01 — Dùng thử và onboarding theo ngữ cảnh

**Ưu tiên:** P1, đợt A. **Phụ thuộc:** OBS-01 để đo hiệu quả.

**Phạm vi:** cho xem danh mục mẫu hoặc nội dung công khai trước khi đăng ký; rút ngắn đường tới giá trị đầu tiên; yêu cầu hồ sơ khi dùng phân tích cá nhân hóa.

**Nghiệm thu:**

- Khách chưa đăng nhập xem được một trải nghiệm mẫu rõ ràng.
- Dữ liệu mẫu được gắn nhãn và không lẫn với số liệu thật.
- Không bắt buộc làm đủ khảo sát để xem nội dung công khai.
- Phân tích cá nhân hóa xử lý rõ hồ sơ chưa hoàn thành, không tự coi người dùng đã có khẩu vị rủi ro cụ thể.
- Sau đăng ký tiếp tục được bước đang làm; đo được điểm rơi khỏi luồng.
- Không mở quyền đọc danh mục thật hoặc nội dung cá nhân cho khách.

## PF-01 — Sổ giao dịch và dòng tiền

**Ưu tiên:** P1, nền móng Danh mục 2.0. **Phụ thuộc:** DATA-01.

**Phạm vi phiên bản đầu:**

- Ghi mua, bán, nạp, rút, phí và cổ tức tiền mặt.
- Lưu ngày, số lượng, giá, đồng tiền, phí, tỷ giá nếu có và nguồn nhập.
- Tính số lượng nắm giữ, giá vốn, lãi đã chốt và chưa chốt từ dữ liệu gốc.
- Có cách sửa/hủy giao dịch với lịch sử thay đổi và tính lại kết quả.
- Thiết lập số dư đầu kỳ cho dữ liệu `Holding` cũ.

**Quy tắc cần chốt trước triển khai:**

- Phương pháp giá vốn, đề xuất bình quân gia quyền cho phiên bản đầu.
- Quy tắc phí/thuế, đơn vị từng tài sản, độ chính xác và làm tròn; ưu tiên số thập phân chính xác cho dữ liệu giao dịch.
- Phân biệt tiền mặt thực trong sổ với số tiền người dùng tự khai báo để tránh đếm hai lần.
- Phạm vi xử lý giao dịch cùng ngày, giao dịch nhập lùi ngày và cổ tức cổ phiếu/chia tách.
- Phiên bản đầu không hỗ trợ bán khống/margin nếu chưa có yêu cầu riêng; chặn bán quá số lượng khả dụng.

**Nghiệm thu:**

- Không tính nạp tiền là lợi nhuận; mua/bán là dịch chuyển giữa tiền mặt và tài sản.
- Thêm giao dịch quá khứ hoặc sửa giao dịch làm tính lại các số liệu phụ thuộc.
- Không tạo số lượng âm ngoài phạm vi được hỗ trợ.
- Dữ liệu cũ chuyển thành số dư đầu kỳ có ngày và nguồn rõ; không bịa lịch sử giao dịch.
- Không tự phát sinh một khoản trừ tiền mua trong quá khứ khi chuyển holding cũ thành số dư đầu kỳ.
- Đối soát số lượng và giá vốn trước/sau chuyển đổi; có cách khôi phục nếu không khớp.
- Dữ liệu hoặc hành động doanh nghiệp chưa hỗ trợ phải được đánh dấu, không âm thầm bỏ qua.

**Bộ số liệu nghiệm thu tối thiểu, chưa tính phí/thuế:**

| Bước | Kết quả mong đợi |
|---|---|
| Nạp 10.000.000 VND | Tiền mặt 10.000.000; lợi nhuận 0 |
| Mua 100 cổ phiếu giá 20.000 | Tiền mặt 8.000.000; giá vốn cổ phiếu 2.000.000 |
| Bán 40 cổ phiếu giá 25.000 | Tiền mặt 9.000.000; còn 60 cổ phiếu; lãi đã chốt 200.000 |
| Giá hiện tại 25.000 | Cổ phiếu trị giá 1.500.000; lãi chưa chốt 300.000; tổng tài sản 10.500.000 |
| Nạp thêm 5.000.000 | Tổng tài sản 15.500.000; tổng lãi vẫn 500.000 |

Test bổ sung phải bao gồm phí, cổ tức, nhiều lần mua, tỷ giá và chỉnh sửa giao dịch quá khứ.

## PF-02 — Nhập CSV và đối soát

**Ưu tiên:** P1. **Phụ thuộc:** PF-01.

**Phạm vi:** mẫu CSV chuẩn, ánh xạ cột, xem trước, kiểm tra lỗi và xác nhận nhập. Chưa yêu cầu kết nối trực tiếp công ty chứng khoán.

**Nghiệm thu:**

- Có file mẫu và hướng dẫn ngày, số thập phân, tiền tệ, đơn vị, loại giao dịch.
- Trước khi nhập hiển thị dòng hợp lệ, dòng lỗi, dòng nghi trùng và tác động dự kiến.
- Không ghi dữ liệu khi người dùng mới tải lên/xem trước.
- Retry cùng một lần nhập không tạo thêm giao dịch.
- Không tự bỏ giao dịch thật chỉ vì có cùng ngày, giá và số lượng; dòng nghi trùng cần có cách xử lý.
- Người dùng biết số dòng thành công/thất bại; lỗi chỉ rõ dòng và nguyên nhân.
- Dữ liệu sau nhập đối soát được với tổng giao dịch và số dư.

**Cần chốt:** chính sách nhập toàn bộ hoặc một phần, giới hạn file và cách hoàn tác một đợt nhập.

## PF-03 — Lịch sử tài sản và hiệu quả theo kỳ

**Ưu tiên:** P1. **Phụ thuộc:** PF-01, DATA-01.

**Phạm vi:** lưu giá trị danh mục theo ngày, biểu đồ tài sản, tiền vào/ra, lãi đã/chưa chốt, phí/cổ tức và hiệu quả trong kỳ.

**Nghiệm thu:**

- Tổng tài sản tăng do nạp tiền được tách khỏi tăng do đầu tư.
- Các số tổng đối soát được với giao dịch và từng tài sản.
- Ngày thiếu giá có trạng thái rõ; không vẽ giá trị ước tính như dữ liệu đầy đủ.
- Giao dịch nhập lùi ngày kích hoạt tính lại kỳ bị ảnh hưởng.
- Danh mục cũ chỉ có số dư đầu kỳ không hiển thị lợi suất lịch sử trước ngày đủ dữ liệu.
- Thống nhất múi giờ, mốc chốt ngày và cách xử lý tài sản giao dịch khác khung giờ.
- Nếu có tỷ suất %, ghi rõ phương pháp và điều kiện đủ dữ liệu; tài liệu hóa cách xử lý vốn bằng 0, dòng tiền trong kỳ và kỳ không đủ dữ liệu.

**Phần mở rộng sau:** TWR/XIRR và benchmark khi có đầu vào đủ tin cậy. So sánh benchmark phải cùng kỳ, đồng tiền và cơ sở lợi suất; chưa đủ dữ liệu thì không đưa kết luận vượt thị trường.

## HOME-01 — Trang “Hôm nay của tôi”

**Ưu tiên:** P1. **Phụ thuộc:** DATA-01; PF-03 cho hiệu quả trong ngày.

**Phạm vi:** đưa tổng quan cá nhân lên vị trí chính; giữ đường truy cập bảng giá hiện có.

**Nghiệm thu:**

- Hiển thị tổng tài sản, thay đổi trong kỳ và thời điểm dữ liệu.
- Chỉ ra tài sản đóng góp tăng/giảm dựa trên phép tính backend, có xử lý tiền nạp/rút và giao dịch trong kỳ.
- Hiển thị tin liên quan, bản tin mới và các điểm cần xem lại có lý do rõ.
- Có hành động sang xem tài sản, đọc bản tin, hỏi cố vấn hoặc xem kế hoạch.
- Người chưa có tài sản thấy hướng dẫn/watchlist/mẫu phù hợp.
- Lỗi một khối không làm hỏng toàn trang.
- Có bố cục dùng được trên điện thoại; không bắt người dùng đọc bảng rộng cho thông tin tổng quan.

## BRIEF-01 — Tổng kết cá nhân hằng tuần

**Ưu tiên:** P1. **Phụ thuộc:** PF-03, AI-01; NT-01 chỉ cần nếu gửi ngoài ứng dụng.

**Phạm vi:** mở rộng cơ chế bản tin hiện có với hiệu quả tuần, thay đổi phân bổ, sự kiện liên quan và việc cần xem lại.

**Nghiệm thu:**

- Con số lấy từ kết quả tính toán, có kỳ dữ liệu và thời điểm rõ.
- Tách tiền nạp/rút khỏi lợi nhuận.
- Thiếu dữ liệu tuần thì giải thích phần nào chưa tính được.
- Mỗi người tối đa một bản chính thức cho cùng kỳ; retry không tạo trùng.
- Người dùng bật/tắt được và hỏi tiếp trong cuộc trò chuyện.
- Có kiểm tra tính nhất quán con số với danh mục; không coi mọi bản tin đã đi qua verifier của chat nếu chưa tích hợp.
- Đo được lượt mở và hành động tiếp theo.

## PLAN-01 — Kế hoạch và nhật ký đầu tư

**Ưu tiên:** P2. **Phụ thuộc:** WL-01 hoặc PF-01 để liên kết tài sản; OBS-01 để đo.

**Phạm vi:** lưu luận điểm đầu tư, thời gian dự kiến nắm giữ, điều kiện xem lại, ngày đánh giá tiếp và kết quả đánh giá.

**Nghiệm thu:**

- Tạo kế hoạch cho tài sản đang giữ hoặc đang theo dõi.
- Các lần sửa giữ được phiên bản trước và ngày thay đổi.
- AI hỗ trợ viết nháp; chỉ lưu thành kế hoạch sau hành động xác nhận của người dùng.
- Nhắc xem lại kế hoạch vào ngày đã chọn; lưu được quyết định giữ/sửa/kết thúc và lý do.
- Khi đánh giá, phân biệt điều kiện người dùng tự đặt, dữ kiện có nguồn và nhận định AI.
- Không suy ra người dùng đã thực hiện giao dịch chỉ từ nội dung chat.
- Khi đã có dữ liệu giao dịch, liên kết được giao dịch với kế hoạch tương ứng.

## NT-01 — Một kênh thông báo ngoài ứng dụng

**Ưu tiên:** P2, có thể đưa sớm theo nhu cầu. **Phụ thuộc:** lựa chọn kênh; AI-01 nếu dùng chung hạ tầng tác vụ.

**Phạm vi:** chọn một trong email, Telegram hoặc web push để thử nghiệm; tái sử dụng sự kiện thông báo hiện có.

**Nghiệm thu:**

- Người dùng chủ động đăng ký và xác nhận đúng địa chỉ/thiết bị đích.
- Bật/tắt theo loại tin, đặt giờ yên lặng và giới hạn tần suất.
- Tắt nhận tin có hiệu lực với cả tác vụ còn chờ gửi.
- Có trạng thái gửi, lỗi, retry và khóa chống gửi trùng.
- Thông báo mở đúng nội dung; sau đăng nhập vẫn quay về nội dung đích.
- Không đưa số dư/ghi chú nhạy cảm vào nội dung hiển thị ngoài ứng dụng theo mặc định.
- Không gửi hàng loạt tới tài khoản hiện tại khi chưa có lựa chọn nhận tin.
- Test bằng người nhận thử nghiệm đã xác nhận.

**Cần chốt:** kênh đầu tiên, nhà cung cấp, chi phí, cách xác nhận đích nhận và chính sách giờ yên lặng.

## GOAL-01 — Mục tiêu tài chính và phân bổ mục tiêu

**Ưu tiên:** P3. **Phụ thuộc:** PF-03; xác nhận nhu cầu sản phẩm.

**Phạm vi:** số tiền mục tiêu, ngày đích, khoản đóng góp định kỳ, tài sản được phân bổ và tỷ trọng mong muốn.

**Nghiệm thu:**

- Tiến độ thực tế dựa trên tài sản được người dùng gán cho mục tiêu.
- Không tính cùng một phần tài sản vào nhiều mục tiêu mà không thể hiện rõ việc phân bổ.
- Tỷ trọng mục tiêu được kiểm tra hợp lệ; hiển thị độ lệch so với hiện tại.
- Mô phỏng thay đổi mức đóng góp hoặc giả định lợi suất có nhãn rõ, không trình bày như kết quả được đảm bảo.
- Người dùng sửa/tạm dừng mục tiêu mà không làm mất lịch sử giao dịch.

## BIZ-01 — Thử nghiệm gói trả phí

**Ưu tiên:** P2 sau khi có người dùng quay lại. **Phụ thuộc:** OBS-01, AI-01 và dữ liệu sử dụng của đợt B.

**Phạm vi:** phỏng vấn nhóm sử dụng đều; thử thông điệp và phạm vi gói cơ bản/nâng cao; lập mô hình chi phí.

**Nghiệm thu:**

- Có bằng chứng nhu cầu cho từng quyền lợi dự kiến thu phí.
- Có chi phí AI/dữ liệu/vận hành ước tính trên mỗi nhóm sử dụng.
- Giới hạn gói được mô tả rõ và có thể thực thi phía server khi xây tính năng.
- Giá và tiêu chí thành công của thử nghiệm được product chốt trước khi triển khai thanh toán.
- Không quảng bá quyền lợi chưa tồn tại như tính năng đã sẵn sàng.

## Checklist bàn giao mỗi đợt

- [ ] Đánh dấu ticket đã xong và phần bị hoãn, kèm lý do.
- [ ] Có bản demo các luồng chính trên desktop và điện thoại.
- [ ] Chạy build, kiểm tra kiểu và test phù hợp với thay đổi.
- [ ] Các phép tính tiền/số lượng có dữ liệu đối soát.
- [ ] Kiểm tra quyền sở hữu, dữ liệu thiếu, retry và trạng thái rỗng ở các luồng liên quan.
- [ ] Có kế hoạch chuyển đổi/khôi phục cho thay đổi dữ liệu.
- [ ] Có đo lường và định nghĩa chỉ số cần dùng để đánh giá.
- [ ] README và hướng dẫn vận hành được cập nhật theo tính năng thực tế.
