# Đo hành vi sử dụng (OBS-01)

Sự kiện lưu trong bảng `AnalyticsEvent` của PostgreSQL hiện có. Không dùng dịch vụ bên ngoài, dữ liệu không rời server.

- Từ điển trong code: [backend/src/analytics/events.ts](../backend/src/analytics/events.ts). Thuộc tính ngoài danh sách bị bỏ khi ghi.
- Báo cáo: [backend/src/analytics/report.ts](../backend/src/analytics/report.ts).

## Nguyên tắc

- Không ghi token, nội dung chat, ghi chú đầu tư, email hay giá trị danh mục. Thuộc tính chỉ là nhãn ngắn (`kind`, `decision`, `method`) hoặc số đếm (`rows`).
- Sự kiện từ trang danh mục mẫu (`/demo`) có `sample = true`, được tách khỏi số liệu thật.
- Khách chưa đăng nhập được nhận diện bằng mã ngẫu nhiên lưu trong trình duyệt (`anonId`), không gắn với danh tính.
- Chống trùng bằng ràng buộc duy nhất `(actor, dedupeKey)`. `actor` là `userId`, hoặc `anon:<anonId>` với khách.
- Ghi sự kiện không bao giờ làm hỏng thao tác chính: lỗi chỉ ghi log.
- API `POST /api/events` chỉ nhận các sự kiện phía trình duyệt có trong từ điển. Giới hạn 30 sự kiện/phút cho mỗi người dùng hoặc IP.

## Từ điển sự kiện

| Sự kiện | Nguồn | Thời điểm phát | Thuộc tính | Chống trùng |
|---|---|---|---|---|
| `signup` | server | Tạo tài khoản (mật khẩu, hoặc Google lần đầu) | `method` | Một lần / người |
| `onboarding_completed` | server | Lưu khảo sát khẩu vị lần đầu | — | Một lần / người |
| `onboarding_skipped` | client | Bấm "Để sau" ở khảo sát | — | Một lần / người |
| `first_real_asset_added` | server | Giao dịch hoặc số dư thật đầu tiên, ghi tay hoặc qua CSV; không tính dữ liệu chuyển đổi | `via` | Một lần / người |
| `import_completed` | server | Xác nhận nhập CSV, trừ trường hợp gửi lại cùng file | `rows` | Theo đợt nhập |
| `portfolio_viewed` | client | Mở trang Danh mục | — | Một lần / người / ngày |
| `app_active` | client | Mở app khi đã đăng nhập | — | Một lần / người / ngày |
| `brief_generated` | server | Bản tin sáng, chiều hoặc tuần đã tạo và gửi thông báo | `kind`, `test` | Theo người và kỳ |
| `brief_opened` | server | Mở cuộc trò chuyện chứa bản tin | `kind` | Lần mở đầu tiên / bản tin |
| `brief_followup` | server | Hỏi tiếp cố vấn trong cuộc trò chuyện của bản tin | `kind` | Lần hỏi đầu tiên / bản tin |
| `advisor_asked` | server | Gửi một câu hỏi cho cố vấn, không ghi nội dung | `inBrief` | Không |
| `plan_created` | server | Lưu kế hoạch đầu tư mới | — | Không |
| `plan_reviewed` | server | Ghi một lần xem lại kế hoạch | `decision` | Không |
| `demo_viewed` | client | Khách xem danh mục mẫu | — | Một lần / thiết bị / ngày |
| `demo_signup_clicked` | client | Khách bấm đăng ký hoặc đăng nhập từ trang mẫu | `target` | Một lần / thiết bị / ngày |

"Ngày" tính theo giờ Việt Nam.

## Định nghĩa chỉ số

- **Cohort**: người dùng theo tuần đăng ký, lấy từ `User.createdAt`, tuần bắt đầu thứ Hai theo giờ VN.
- **Kích hoạt**: có giao dịch thật đầu tiên (`source` là `manual` hoặc `csv`) trong 7 ngày sau đăng ký. Chỉ số này lấy từ sổ giao dịch, nên tính được cả cho người dùng cũ.
- **Ngày hoạt động**: ngày có ít nhất một sự kiện thật do chính người dùng tạo. Sự kiện hệ thống như `brief_generated` không được tính.
- **D7**: có hoạt động trong ngày 7–13 sau đăng ký. Chỉ tính cho cohort đã qua ít nhất 14 ngày.
- **D30**: có hoạt động trong ngày 30–59 sau đăng ký. Chỉ tính cho cohort đã qua ít nhất 60 ngày.
- **DAU / WAU / MAU**: số người dùng có hoạt động trong 1 / 7 / 30 ngày gần nhất.
- **Bản tin**: trong 30 ngày, đếm số bản đã tạo (không tính "Gửi thử"), số bản được mở và số bản có hỏi tiếp.

Sự kiện chỉ có từ khi triển khai đo lường, nên D7/D30 của các cohort trước đó sẽ thấp hơn thực tế.

## Xem báo cáo

Trên server, trong thư mục `backend`:

```bash
npm run report:usage        # 8 tuần gần nhất
npm run report:usage -- 26  # 26 tuần
```

Lệnh dùng `DATABASE_URL` trong `backend/.env` và in ra các bảng cohort, người dùng hoạt động, bản tin và số sự kiện 30 ngày.

## Lưu giữ

Cron 03:30 mỗi ngày xoá sự kiện cũ hơn 400 ngày (`RETENTION_DAYS`). Sự kiện không có khoá ngoại tới `User`, nên xoá tài khoản không tự xoá sự kiện. Sự kiện chỉ chứa id, không có thông tin cá nhân.
