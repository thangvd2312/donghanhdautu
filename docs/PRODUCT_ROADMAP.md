# Định hướng mở rộng Đồng Hành Đầu Tư

- Ngày lập: 20/10/2026.
- Mục đích: tài liệu bàn giao cho product và dev để lập kế hoạch cải thiện sản phẩm.
- Trạng thái: đề xuất để triển khai; các tính năng trong roadmap chưa được xây dựng.
- Backlog và tiêu chí nghiệm thu: [DEV_BACKLOG.md](DEV_BACKLOG.md).

## 1. Định hướng sản phẩm

Phát triển Đồng Hành Đầu Tư thành công cụ quản lý danh mục và duy trì kỷ luật đầu tư cá nhân: biết người dùng đang sở hữu gì, hiệu quả đầu tư theo thời gian, kế hoạch ban đầu và những thay đổi cần chú ý.

Lợi thế cần phát huy là sự kết hợp giữa danh mục đa tài sản, hồ sơ rủi ro, AI có dữ liệu và nguồn tham khảo, cảnh báo và bản tin cá nhân hóa.

**Nhóm người dùng giả định:** người đi làm tại Việt Nam, có tài sản đầu tư ở nhiều nơi, ưu tiên tích lũy trung và dài hạn. Đây là giả định làm việc, chưa được xác nhận bằng nghiên cứu người dùng. Product cần kiểm chứng trước khi mở rộng phạm vi lớn.

Giá trị sản phẩm cần thể hiện qua bốn câu hỏi:

1. Tôi đang có bao nhiêu tài sản và phân bổ thế nào?
2. Tôi đầu tư hiệu quả ra sao, sau khi tách tiền nạp/rút và các chi phí?
3. Hôm nay có việc gì thực sự liên quan đến danh mục của tôi?
4. Các quyết định của tôi có còn phù hợp với kế hoạch ban đầu không?

## 2. Hiện trạng đã kiểm tra

Đánh giá dựa trên mã nguồn trong repository, chưa kiểm thử toàn bộ giao diện, môi trường production hoặc chất lượng trả lời AI với nguồn dữ liệu trực tiếp.

### Những phần đã có

- Bảng giá cổ phiếu Việt Nam, vàng, crypto và tỷ giá.
- Khảo sát khẩu vị rủi ro, mục tiêu và thời gian đầu tư.
- Nhập tài sản, tính giá trị hiện tại, lãi/lỗ so với giá vốn và tỷ trọng.
- Chat AI có công cụ dữ liệu, streaming, đối chiếu nguồn, đính chính và báo sai.
- Cảnh báo biến động, cảnh báo mốc giá, tin tức và bản tin sáng/cuối phiên.
- Đăng nhập email/Google; lưu dữ liệu bằng PostgreSQL và Prisma.
- Quy trình build/deploy và script sao lưu.

### Khoảng trống cần xử lý

| Hiện trạng trong code | Hệ quả | Hạng mục |
|---|---|---|
| `Holding` lưu số lượng và giá vốn hiện tại; chưa có sổ giao dịch/dòng tiền | Chưa đo được hiệu quả đầu tư theo kỳ đầy đủ | PF-01, PF-02, PF-03 |
| Toàn bộ trang ứng dụng yêu cầu đăng nhập; tài khoản mới phải khảo sát | Người mới chưa thấy giá trị trước khi bỏ công thiết lập | ACQ-01 |
| `WatchItem` có trong database và được đọc để lấy giá; chưa thấy luồng quản lý ở API/UI | Người chưa sở hữu tài sản thiếu điểm bắt đầu | WL-01 |
| Thông báo được lưu và đẩy qua socket | Chưa có kênh chủ động tiếp cận khi người dùng đóng ứng dụng | NT-01 |
| Chưa thấy đo hành vi sản phẩm và ghi nhận chi phí AI theo người dùng | Khó đánh giá giữ chân người dùng và mô hình thu phí | OBS-01, AI-01 |
| Một phần tổng giá trị dùng giá vốn khi thiếu giá thị trường | Tổng danh mục có thể bị hiểu là đã được định giá đầy đủ | DATA-01 |

### Kết quả kiểm tra tại thời điểm đánh giá

| Kiểm tra | Kết quả |
|---|---|
| Build frontend | Thành công |
| Build backend | Thành công |
| Backend unit tests | 3 bộ test, 18/18 test đạt |
| Frontend lint | 0 lỗi, 4 cảnh báo Fast Refresh |
| Bundle frontend | Khoảng 1.17 MB JavaScript minified, 368 kB gzip; có cảnh báo kích thước |
| CI hiện tại | Chạy typecheck/build; chưa chạy unit test sẵn có |

Các kết quả trên không chứng minh toàn bộ luồng nghiệp vụ hoặc AI đã đúng. Chưa chạy bộ đánh giá AI live và chưa đo hiệu năng thực tế trên thiết bị người dùng.

## 3. Thứ tự ưu tiên tính năng

| Thứ tự | Tính năng | Giá trị chính | Phiên bản đầu |
|---|---|---|---|
| 1 | Danh mục có lịch sử và hiệu quả đầu tư | Tạo lý do sử dụng lâu dài | Giao dịch, dòng tiền, phí, cổ tức, lãi đã/chưa chốt, nhập CSV, lịch sử tài sản |
| 2 | Trang “Hôm nay của tôi” | Giúp người dùng biết cần quan tâm điều gì | Tổng quan cá nhân, đóng góp tăng/giảm, tin liên quan, bản tin, điểm cần xem lại |
| 3 | Kế hoạch và nhật ký đầu tư | Phát triển khả năng hỗ trợ giữ kỷ luật | Lý do mua, thời gian nắm giữ, điều kiện xem lại, nhắc đánh giá và lịch sử quyết định |
| 4 | Cảnh báo ngoài ứng dụng | Tăng khả năng quay lại đúng lúc | Một kênh gửi, tùy chọn nhận tin, giờ yên lặng, chống trùng |
| 5 | Watchlist và dùng thử | Giảm công sức bắt đầu | Theo dõi tài sản chưa sở hữu, danh mục mẫu, khảo sát theo ngữ cảnh |
| 6 | Mục tiêu tài chính | Liên kết tài sản với kế hoạch dài hạn | Số tiền đích, thời hạn, đóng góp định kỳ, tỷ trọng mục tiêu và tiến độ |

Thứ tự giá trị sản phẩm khác với thứ tự kỹ thuật: watchlist và dùng thử có thể triển khai sớm vì phạm vi nhỏ. Lịch sử giao dịch phải đi trước báo cáo hiệu quả đầy đủ.

**Hạng mục lớn ưu tiên cho phiên bản tiếp theo:** “Danh mục 2.0” gồm lịch sử giao dịch, hiệu quả theo thời gian và tổng kết cá nhân hằng tuần.

## 4. Lộ trình theo đợt

Không gắn cam kết thời gian khi chưa biết số lượng dev, nguồn dữ liệu và tốc độ thực tế của đội.

| Đợt | Hạng mục | Điều kiện hoàn thành |
|---|---|---|
| A — Đo lường và hoàn thiện nền tảng | DATA-01, OBS-01, AI-01, QA-01, WL-01, ACQ-01 | Dữ liệu thiếu được thể hiện rõ; đo được kích hoạt/sử dụng; có kiểm soát AI; người mới thử được sản phẩm |
| B — Danh mục 2.0 | PF-01 → PF-02/PF-03 → HOME-01 → BRIEF-01 | Ghi và nhập giao dịch có kiểm chứng; tính đúng dòng tiền/lợi nhuận; có trang tổng quan và bản tin tuần |
| C — Kế hoạch và giữ chân | PLAN-01, NT-01; thử BIZ-01 | Người dùng lưu và xem lại kế hoạch, nhận thông báo theo lựa chọn; có dữ liệu cho thử nghiệm trả phí |
| D — Mở rộng theo nhu cầu đã xác nhận | GOAL-01, nhiều danh mục, thêm kênh thông báo | Có bằng chứng sử dụng và nhu cầu trước khi tăng phạm vi |

NT-01 có thể đưa lên sớm hơn nếu nghiên cứu người dùng xác nhận họ cần nhận cảnh báo khi không mở ứng dụng.

## 5. Chỉ số đánh giá

Ưu tiên đo tỷ lệ người dùng quay lại quản lý danh mục và xem lại kế hoạch.

| Chỉ số | Định nghĩa ban đầu |
|---|---|
| Kích hoạt danh mục | Tỷ lệ tài khoản mới thêm tài sản thật hoặc hoàn tất nhập dữ liệu trong 7 ngày đầu |
| Thời gian tới giá trị đầu tiên | Thời gian từ đăng ký tới xem tổng quan có dữ liệu thật của chính người dùng |
| Quay lại D7/D30 | Tỷ lệ người đã kích hoạt có hoạt động trong ngày thứ 7/thứ 30; thống nhất múi giờ và cách lập cohort |
| Tương tác bản tin | Tỷ lệ người nhận mở bản tin trong ứng dụng; theo dõi thêm hỏi tiếp hoặc xem kế hoạch |
| Duy trì nhật ký | Tỷ lệ người có kế hoạch thực hiện ít nhất một lần đánh giá lại trong kỳ |
| Chi phí AI | Chi phí ước tính trên người dùng hoạt động, theo chat/bản tin/cảnh báo/kiểm tra nguồn |
| Chất lượng dữ liệu | Tỷ lệ danh mục có giá đầy đủ và còn mới; số lỗi định giá/nhập dữ liệu |
| Chất lượng AI | Tỷ lệ báo sai, kết quả eval và mức hữu ích do người dùng phản hồi |

Chưa có baseline trong tài liệu này. Sau khi đo đủ một cohort, product mới đặt mục tiêu tăng trưởng; không coi số lượng câu chat là đại diện duy nhất cho giá trị.

## 6. Giả thuyết thu phí

- Gói cơ bản: theo dõi một danh mục, watchlist và mức sử dụng AI có giới hạn.
- Gói nâng cao: nhiều danh mục, báo cáo hiệu quả, tổng kết chuyên sâu, theo dõi kế hoạch và mức sử dụng AI cao hơn.
- Chưa chốt giá; cần kiểm chứng nhu cầu trả tiền và chi phí phục vụ.
- Đo nhu cầu bằng phỏng vấn và thử nghiệm giới hạn với người đã sử dụng đều.
- Không tự động thêm thanh toán, tích hợp công ty chứng khoán hoặc đặt lệnh giao dịch vào phạm vi đợt đầu.

## 7. Tài liệu tham chiếu

### Mã nguồn

- [Mô hình dữ liệu](../backend/prisma/schema.prisma).
- [Định giá danh mục](../backend/src/portfolio/portfolio.module.ts).
- [Điều hướng và onboarding](../frontend/src/App.tsx).
- [Trang danh mục hiện tại](../frontend/src/pages/PortfolioPage.tsx).
- [Thông báo](../backend/src/alerts/notifier.service.ts).
- [Tạo bản tin](../backend/src/alerts/briefs.service.ts).
- [Chat và kiểm tra nguồn](../backend/src/advisor/advisor.service.ts).
- [CI/CD](../.github/workflows/deploy.yml).

### Tham khảo thị trường

- [FireAnt — phân tích danh mục](https://help.fireant.vn/fireant-ai-answer/watchlist/view-blocks/): AI tổng hợp, biến động giá, lịch sự kiện, so sánh cùng ngành.
- [Sharesight — tính năng](https://www.sharesight.com/features/): theo dõi hiệu quả, cổ tức, phân bổ và nhập giao dịch.

Các tham khảo được xem trong lần đánh giá ngày 20/10/2026. Đây là đầu vào định hướng, không phải bằng chứng sản phẩm đã có nhu cầu hoặc lợi thế cạnh tranh được xác nhận.
