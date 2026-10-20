# Vận hành production

## Kiến trúc

- **Server:** `thangvv@100.123.48.95`, chỉ vào được qua Tailscale. App nằm ở `~/apps/dautu`.
- **Truy cập công khai:** https://dautu.thangvu.io.vn, đi qua Cloudflare.
- **Process:** một process NestJS do pm2 quản lý (`dautu`, cấu hình trong `ecosystem.config.cjs`). Process này phục vụ API `/api`, socket.io và bản build React (`frontend/dist`). Cổng nội bộ `127.0.0.1:4200`.
- **Database:** PostgreSQL 16 chạy trong Docker (container `dautu-postgres`, `docker-compose.yml`).
- **Biến môi trường:** nằm ở `~/apps/dautu/.env`. Process đọc file này lúc khởi động (`node --env-file=../.env`), nên sửa `.env` xong phải chạy `pm2 restart dautu --update-env`.

## Deploy

Push lên `main` sẽ chạy GitHub Actions (`.github/workflows/deploy.yml`):

1. **Kiểm tra (`check`):** build, unit test, test tích hợp PostgreSQL, lint.
2. **Deploy (`deploy`):** chạy trên runner self-hosted đặt tại server, gồm các bước:
   1. rsync code vào `~/apps/dautu`;
   2. `npm run build`;
   3. sao lưu DB vào `~/backups/dautu/pre-deploy/`;
   4. `prisma migrate deploy`;
   5. `pm2 startOrReload`;
   6. health check `/api/health`.

Xem trạng thái: tab Actions trên GitHub, hoặc `https://api.github.com/repos/thangvd2312/donghanhdautu/actions/runs?per_page=3` (repo public).

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | có | PostgreSQL |
| `JWT_SECRET` | có | Ký token đăng nhập |
| `PORT`, `HOST` | | Mặc định 3000 / 0.0.0.0 (production 4200) |
| `FRONTEND_ORIGIN`, `APP_URL` | | CORS và link trong thông báo Telegram / Web Push |
| `GOOGLE_CLIENT_ID` | | Đăng nhập Google |
| `LLM_API_KEY`, `LLM_BASE_URL` | | AI. Có `LLM_BASE_URL` (router) thì tự bật chế độ tương thích; ép bằng `ADVISOR_COMPAT_MODE=true/false` |
| `LLM_MODEL`, `LLM_MODEL_ADVISOR`, `LLM_MODEL_BRIEF`, `LLM_MODEL_FAST` | | Model cho từng việc |
| `MINIMAX_API_KEY` | | Tìm kiếm web cho cố vấn |
| `AI_PRICES` | nên có | Giá model router để ước tính chi phí, xem [AI_COSTS.md](AI_COSTS.md). **Gemini 3.8 Flash tăng giá ngày 1/1/2027** |
| `AI_CHAT_DAILY_LIMIT` (40), `AI_BRIEF_TEST_DAILY_LIMIT` (3), `AI_PLAN_DRAFT_DAILY_LIMIT` (20) | | Quota mỗi người mỗi ngày |
| `AI_DAILY_BUDGET_USD` (20) | | Ngân sách AI chung mỗi ngày; `0` là không giới hạn |
| `BRIEF_CONCURRENCY` (3) | | Số bản tin tạo song song |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_API_BASE`, `TELEGRAM_POLLING` | | Telegram (đi qua Cloudflare Worker vì server bị chặn Telegram) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | | Web Push. Bỏ trống thì app tự tạo khoá và lưu trong bảng `AppSetting` |

## Tác vụ định kỳ (giờ VN)

| Lúc | Việc |
|---|---|
| 1 phút / lần | Cảnh báo giá và biến động |
| 10 phút / lần | Tin tức liên quan danh mục |
| 2 giờ / lần | Số liệu vĩ mô (tỷ giá trung tâm, lãi suất) |
| 10 giây / lần | Gửi hàng đợi Telegram, Web Push |
| 15 giây / lần | Lấy việc trong hàng đợi bản tin |
| 08:00 hằng ngày | Nhắc xem lại kế hoạch tới hạn |
| 08:30 thứ 2–6 | Xếp việc bản tin sáng |
| 15:10 thứ 2–6 | Xếp việc bản tin cuối phiên |
| 09:00 thứ 7 | Xếp việc tổng kết tuần |
| 23:50 hằng ngày | Lưu giá vàng và tỷ giá USDT cuối ngày |
| 03:00 hằng ngày | Sao lưu DB (crontab của server, `scripts/backup-db.sh`, giữ 14 bản) |
| 03:30 hằng ngày | Xoá sự kiện đo lường cũ hơn 400 ngày |

## Lệnh thường dùng

Chạy trên server, trong `~/apps/dautu/backend`:

```bash
pm2 status && pm2 logs dautu --lines 100 --nostream      # tình trạng và log
tail -50 ~/.pm2/logs/dautu-error.log                      # lỗi
curl -s http://127.0.0.1:4200/api/health                  # health
npm run briefs:jobs                                       # hàng đợi bản tin 7 ngày + việc lỗi
npm run briefs:jobs -- retry failed                       # chạy lại việc lỗi
npm run report:usage                                      # báo cáo sử dụng, chất lượng, chi phí AI
node --env-file=../.env dist/portfolio/reconcile.js       # đối soát Holding với sổ giao dịch (in "Khớp")
node --env-file=../.env node_modules/.bin/prisma migrate status
```

## Sao lưu và khôi phục

- Bản sao lưu hằng ngày nằm ở `~/backups/dautu/` (`dautu-YYYY-MM-DD-HHMM.sql.gz`).
- Bản sao lưu trước mỗi lần deploy nằm ở `~/backups/dautu/pre-deploy/`.

Khôi phục một bản sao lưu. Thao tác này **ghi đè** toàn bộ dữ liệu sau thời điểm sao lưu:

```bash
cd ~/apps/dautu
pm2 stop dautu
docker exec -i dautu-postgres sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c ~/backups/dautu/pre-deploy/dautu-YYYY-MM-DD-HHMM.sql.gz | docker exec -i dautu-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q'
pm2 start dautu
```

Trước khi khôi phục, sao lưu hiện trạng một lần nữa bằng `scripts/backup-db.sh` để còn đường lui.

## Rollback một lần deploy lỗi

1. **Lỗi code, không đổi schema:** `git revert <commit>` rồi push. CI sẽ deploy lại bản cũ.
2. **Có migration chỉ thêm** (bảng / cột cho phép null / index): revert code là đủ. Bảng mới không ảnh hưởng code cũ; xoá bảng sau nếu cần.
3. **Có migration đổi hoặc xoá dữ liệu:** dừng app, khôi phục bản `pre-deploy` của lần deploy đó (mục trên), revert commit, rồi push. Dữ liệu ghi từ lúc deploy tới lúc khôi phục sẽ mất, nên ghi lại thời điểm để báo người dùng.

Các migration hiện có đều chỉ thêm bảng / cột / index.

## Kiểm tra sau deploy

1. Health check của CI đạt.
2. `pm2 logs dautu --lines 100 --nostream`: có dòng "Nest application successfully started", không có ERROR mới.
3. Đổi sổ giao dịch thì chạy `reconcile.js`, kết quả phải là "Khớp".
4. Đổi bản tin hoặc hàng đợi: sau giờ chạy, `npm run briefs:jobs` không có việc `failed`.
