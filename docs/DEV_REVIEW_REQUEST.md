# Yêu cầu dev phản hồi kết quả review

Ngày: 20/10/2026.

> **Cập nhật 21/10/2026:** các vấn đề trong tài liệu này đã được xử lý và deploy. Kết luận, commit và bằng chứng của từng mục nằm ở bảng "Mẫu phản hồi" (mục 4) và chi tiết ở [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md#0-cập-nhật-sau-khi-sửa-21102026). Nội dung phía dưới giữ nguyên để đối chiếu.

## Nội dung gửi dev

Nhờ team đối chiếu source hiện tại với [backlog đã thống nhất](DEV_BACKLOG.md) và phản hồi các điểm dưới đây.

Review hiện ước tính hoàn thành **60–65% theo tiêu chí nghiệm thu**. Có **12/15 hạng mục đã được triển khai đáng kể**, tương đương 80% nếu chỉ đếm sự hiện diện của tính năng. Một số mục đang ghi “Đã làm” vẫn còn lỗi hoặc chưa có bằng chứng nghiệm thu đầy đủ.

Điểm tổng hợp 63% là ước lượng review, với trọng số ngang nhau cho 15 hạng mục; không phải tỷ lệ công sức, test coverage hay kết luận về production. Team có thể điều chỉnh đánh giá nếu cung cấp bằng chứng phần đã hoàn thành.

Chi tiết điểm từng hạng mục, vị trí source và giới hạn kiểm tra nằm trong [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md).

## 1. Bốn vấn đề cần xác nhận và xử lý trước

### R1 — Nhập CSV bị trùng khi retry

- File có hai dòng nạp cùng ngày, cùng số tiền 1.000.000 VND.
- Người dùng chọn giữ dòng nghi trùng thứ hai: `includeDuplicates: [3]`.
- Lần đầu nhập được 2 giao dịch.
- Gửi lại nguyên yêu cầu làm tổng tăng thành 3 giao dịch.

**Kỳ vọng:** retry cùng thao tác nhập trả lại kết quả cũ và vẫn chỉ có 2 giao dịch.

**Nhờ dev phản hồi:** có tái hiện được với PostgreSQL thật không? Cơ chế nhận diện một lần nhập đã ổn định trước bước lọc nghi trùng chưa? PR sửa và regression test nào chứng minh retry không ghi thêm?

### R2 — Tăng/giảm hôm nay chưa xét giao dịch trong ngày

- Giá tham chiếu 10.000 VND, giá hiện tại 11.000 VND.
- Người dùng vừa mua 100 cổ phiếu tại 11.000 VND; giá sau khi mua chưa đổi.
- Hệ thống tính đóng góp tăng khoảng 100.000 VND theo giả định giữ số lượng đó từ đầu ngày.

**Kỳ vọng:** hiệu quả của người dùng trong ví dụ này là 0 VND trước phí; biến động so với giá tham chiếu phải được phân biệt rõ với lãi của người dùng.

**Nhờ dev phản hồi:** trang Hôm nay đã dùng sổ giao dịch để tính vị thế đầu kỳ, mua/bán trong ngày và dòng tiền chưa? Nếu vẫn chỉ là mô phỏng theo số lượng hiện tại, nhờ cập nhật phạm vi và trạng thái HOME-01.

### R3 — Thiếu giá đầu kỳ nhưng kết quả không được gắn nhãn ước tính

- Khai báo đầu kỳ 100 cổ phiếu, giá vốn 10.000 VND.
- Ngày khai báo không có giá thị trường; ngày sau có giá 11.000 VND.
- Báo cáo trả lợi nhuận kỳ 100.000 VND và `isEstimate: false`.

**Kỳ vọng:** thể hiện thiếu đầu vào để tách lãi có trước khi theo dõi; không trình bày kết quả như dữ liệu đầy đủ.

**Nhờ dev phản hồi:** trạng thái thiếu/cũ/dự phòng đã được truyền xuyên suốt từ nguồn giá tới báo cáo kỳ chưa? Có test cho thiếu giá opening, stale/fallback hôm nay và thiếu tỷ giá không?

### R4 — Mục tiêu tài chính có thể phân bổ quá 100%

- Gửi đồng thời hai yêu cầu tạo mục tiêu.
- Mỗi mục tiêu lấy 60% cùng một tài sản.
- Cả hai yêu cầu có thể cùng qua kiểm tra rồi ghi thành công, tổng phân bổ 120%.

**Kỳ vọng:** kiểm tra và ghi phải bảo đảm tổng phân bổ không vượt 100% ngay cả khi có request đồng thời.

**Nhờ dev phản hồi:** có test cạnh tranh với DB thật cho cả tạo và sửa mục tiêu chưa? Cơ chế nào bảo vệ điều kiện này?

**Phạm vi bằng chứng:** R2/R3 đã tái hiện bằng hàm thật với dữ liệu tổng hợp. R1/R4 đã tái hiện bằng service thật trên PostgreSQL local, dùng database tạm dựng từ migration. R1: retry tạo 3 giao dịch và 2 đợt nhập. R4: 19/20 lần gửi đồng thời vượt 100%. Chưa khẳng định các tình huống đã xảy ra trên production.

## 2. Những phần còn thiếu cần chốt kế hoạch

| Hạng mục | Câu hỏi cần dev phản hồi |
|---|---|
| AI-01 | Khi nào có usage/chi phí theo người dùng, quota phía server, ngân sách, giới hạn đồng thời và xử lý hội thoại dài? Hàng đợi tạo bản tin phục hồi sau restart thế nào? |
| OBS-01 | Đã có hệ thống analytics ngoài repo chưa? Nếu có, cung cấp từ điển sự kiện và báo cáo kích hoạt, D7/D30, lượt mở bản tin; nếu chưa, đề xuất phạm vi và lịch làm. |
| BRIEF-01 | Hai worker hoặc lỗi giữa tạo conversation và notification có tạo trùng bản tin không? Có khóa duy nhất theo người/kỳ và test khôi phục chưa? |
| NT-01 | Nếu đã lưu notification nhưng tạo delivery thất bại, hệ thống phát hiện và đưa lại vào hàng đợi bằng cách nào? Có bằng chứng kiểm thử opt-out, retry và lỗi giữa các bước không? |
| ACQ-01 | Việc bắt khảo sát ngay sau đăng ký có phải quyết định đã chốt lại không? Đích `next` có được giữ qua đăng ký và onboarding không? |
| QA-01 | Mobile audit có làm test thất bại khi phát hiện lỗi quan trọng không? Đã có test tích hợp cho CSV, ghi đồng thời, migration và rollback chưa? |
| PF-01 / DATA-01 | Đã đối soát dữ liệu cũ sau migration chưa? Quy ước lợi nhuận USDT quy đổi và lợi nhuận VND thực tế được thể hiện ở đâu? |
| BIZ-01 | Nhờ product/chủ sản phẩm xác nhận nghiên cứu người dùng, nhu cầu trả phí và mô hình chi phí đã có ở đâu; dev xác nhận phần hỗ trợ kỹ thuật tương ứng. |

Các tính năng bổ sung như nhiều danh mục, PWA và Web Push được ghi nhận. Nhờ team xác nhận rõ nếu đã thay đổi ưu tiên hoặc phạm vi backlog, để cập nhật kế hoạch thay vì chỉ đánh dấu toàn bộ hạng mục “Đã làm”.

## 3. Bằng chứng kiểm tra hiện có

- Frontend và backend build đạt.
- Lint frontend/backend đạt.
- Backend đạt 14 bộ test, 122/122 test, cả khi chạy Jest `--runInBand --no-cache` và `npm test` ở thư mục gốc.
- Lần chạy test đầu kết thúc với mã 139, chưa rõ nguyên nhân và chưa tái hiện lại.
- 14 migration áp dụng sạch trên database trống.
- Preview CSV đã được xác nhận có ghi DB: tạo danh mục mặc định và giao dịch opening cho tài khoản cũ.
- Playwright mobile cho 3 trang khách đạt, dù audit ghi 2 lỗi vùng bấm nhỏ. Điều này cho thấy audit chưa làm test thất bại.
- Chưa kiểm thử: migration nâng cấp trên bản sao dữ liệu thật, rollback, phiên Playwright đã đăng nhập, AI live, gửi Telegram/Web Push thực tế.
- Source frontend có thay đổi trong lúc review; nhờ dev ghi rõ commit dùng để xác nhận lại.

## 4. Mẫu phản hồi đề nghị

Nhờ team điền một dòng cho mỗi vấn đề/hạng mục; tránh chỉ trả lời chung “đã làm”.

| ID | Kết luận của dev | Bằng chứng / commit / test | Việc cần làm | Người phụ trách | Dự kiến hoàn thành |
|---|---|---|---|---|---|
| R1 — CSV retry | Đã sửa | `0b8fcfb`; test tích hợp retry / đồng thời / preview | — | dev | 20/10/2026 |
| R2 — Hiệu quả trong ngày | Đã sửa | `0192beb`; 7 unit test theo giao dịch trong ngày | — | dev | 20/10/2026 |
| R3 — Chất lượng báo cáo kỳ | Đã sửa | `55d6205`, `c8ace7a` (giá gốc VNDirect) | — | dev | 21/10/2026 |
| R4 — Phân bổ đồng thời | Đã sửa | `e2ccde5`; test tích hợp tạo / sửa đồng thời | — | dev | 20/10/2026 |
| AI-01 | Đã làm | `c2ba575`, `fa4d056`, `ad75127`, `419ed3f` | Cập nhật `AI_PRICES` khi giá Gemini đổi (1/1/2027) | vận hành | — |
| OBS-01 | Đã làm | `31122f1`, `5dde0e9`; `npm run report:usage` | Đặt mục tiêu sau khi đủ một cohort | product | — |
| BRIEF-01 | Đã sửa | `98d3e90`, `fa4d056`, `ecacebd` | Theo dõi `npm run briefs:jobs` các kỳ đầu | vận hành | — |
| NT-01 | Đã sửa (tự động) | `43caadd`, `9dd0f00` | Thử trên thiết bị thật theo NOTIFICATIONS_TEST.md | product | — |
| ACQ-01 | Đã sửa | `3fa362b`; đo phễu trang mẫu `31122f1` | — | dev | 20/10/2026 |
| QA-01 | Đã làm | `ab99be8`, `06fc0aa`, `9d9872a`, `5f83bd1`, `78b0f5a` | — | dev | 21/10/2026 |
| PF-01 / DATA-01 | Đã làm | `c8ace7a`, `85f776a`, `e30bf8f`; đối soát production "Khớp" | — | dev | 21/10/2026 |
| BIZ-01 — product/chủ sản phẩm | Kỹ thuật sẵn sàng | `710f1c6`, docs/BIZ_COST_MODEL.md | Phỏng vấn, giá, tiêu chí thử nghiệm | product | — |

Kết luận có thể là: **xác nhận cần sửa**, **đã sửa**, **chưa tái hiện**, hoặc **đề nghị đổi phạm vi**. Với “đã sửa”, cần chỉ ra commit và kết quả test; với “chưa tái hiện”, cần ghi môi trường, dữ liệu và các bước đã thử.

## 5. Thứ tự xử lý đề xuất

1. Xác nhận và sửa R1–R4; bổ sung regression test.
2. Hoàn thiện kiểm soát chi phí AI và đo hành vi trước khi tăng mạnh số người dùng.
3. Hoàn thiện chống trùng bản tin và phục hồi hàng đợi thông báo.
4. Nghiệm thu onboarding, mobile và các luồng dữ liệu thật.
5. Cập nhật trạng thái backlog theo ba mức: **đã có code**, **đã qua kiểm tra tự động**, **đã nghiệm thu luồng thật**.
