# Đồng Hành Đầu Tư

Web xem giá realtime (cổ phiếu VN, vàng, crypto, tỷ giá) cho nhà đầu tư cá nhân người Việt, kèm một **cố vấn AI** biết hồ sơ rủi ro và danh mục của từng người, phân tích có dẫn nguồn và chủ động cảnh báo khi tài sản biến động.

## Tài liệu phát triển sản phẩm

- [Đánh giá hiện trạng, định hướng và roadmap](docs/PRODUCT_ROADMAP.md).
- [Backlog cho dev: phạm vi, phụ thuộc và tiêu chí nghiệm thu](docs/DEV_BACKLOG.md).
- [Review mức hoàn thành và các vấn đề cần xử lý](docs/IMPLEMENTATION_REVIEW.md).
- [Tài liệu gửi dev: câu hỏi xác nhận và mẫu phản hồi](docs/DEV_REVIEW_REQUEST.md).

## Tài liệu vận hành

- [Vận hành production: biến môi trường, tác vụ định kỳ, lệnh, sao lưu / khôi phục, rollback](docs/OPERATIONS.md).
- [Kiểm thử: các lớp test, mỗi lớp chứng minh gì, cách chạy](docs/TESTING.md).
- [Đo hành vi và báo cáo sử dụng](docs/ANALYTICS.md) · [Kiểm soát chi phí AI](docs/AI_COSTS.md) · [Mô hình chi phí cho gói trả phí](docs/BIZ_COST_MODEL.md).
- [Tải trang](docs/PERFORMANCE.md) · [Kiểm tra thông báo ngoài app](docs/NOTIFICATIONS_TEST.md).

## Chạy thử

Yêu cầu: Node 22+, Docker.

```bash
# 1. Database
docker compose up -d

# 2. Backend (http://localhost:3000)
cd backend
cp .env.example .env          # rồi điền LLM_API_KEY (+ GOOGLE_CLIENT_ID nếu dùng đăng nhập Google)
npm install
npx prisma migrate deploy
npm run start:dev

# 3. Frontend (http://localhost:5173)
cd ../frontend
npm install
npm run dev
```

Mở http://localhost:5173, đăng nhập bằng Google hoặc email, làm khảo sát 10 câu, nhập tài sản đang có. Tài khoản mới được mời làm khảo sát trước (có nút "Để sau"); trang đích ban đầu được giữ qua đăng ký và khảo sát.

### Bật đăng nhập Google

1. Vào https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID** → loại **Web application**.
2. **Authorized JavaScript origins**: thêm `http://localhost:5173` (và domain thật khi deploy).
3. Copy Client ID vào `backend/.env`: `GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"`, khởi động lại backend.

Không có `GOOGLE_CLIENT_ID` thì nút Google tự ẩn. Email đã đăng ký bằng mật khẩu mà sau đó đăng nhập Google (cùng email) sẽ được gộp vào cùng một tài khoản.

Không có `LLM_API_KEY` thì mọi thứ vẫn chạy, trừ chat cố vấn; thông báo biến động vẫn bắn nhưng dùng câu chữ mẫu thay vì lời khuyên cá nhân hoá.

## Deploy (production)

Push lên `main` → GitHub Actions build, unit test, test tích hợp PostgreSQL, lint; rồi self-hosted runner (label `dautu`) trên server tự deploy vào `/home/thangvv/apps/dautu`: rsync code, `docker compose up` Postgres, build, sao lưu DB (`~/backups/dautu/pre-deploy/`), `prisma migrate deploy`, `pm2 startOrReload` (cả hai app), health check `http://127.0.0.1:4200/api/health` rồi kiểm tra nhịp tim worker (phải lên trong 90 giây, nếu không deploy thất bại). Xem `.github/workflows/deploy.yml` và [docs/OPERATIONS.md](docs/OPERATIONS.md) (lệnh, khôi phục, rollback).

- Hai process NestJS cùng codebase (`ecosystem.config.cjs`): `dautu` (web) phục vụ `/api`, socket.io, `frontend/dist` và poll bảng giá realtime; `dautu-worker` (`dist/worker.js`, không mở cổng) chạy cron, hàng đợi bản tin, gửi Telegram / Web Push. Mỗi lượt việc định kỳ giữ khoá tư vấn PostgreSQL nên không bao giờ chạy trùng. Nhịp tim worker: `curl 127.0.0.1:4200/api/health` → `worker.ok`. Chạy local cần việc nền thì mở thêm `npm run start:worker:dev` (trong `backend/`).
- `.env` ở thư mục gốc trên server (không nằm trong git): biến `POSTGRES_*` cho docker compose + toàn bộ biến của backend (`PORT=4200`, `FRONTEND_ORIGIN=https://dautu.thangvu.io.vn`…).
- Postgres 16 trong Docker, chỉ mở `127.0.0.1:5434`, dữ liệu ở volume cố định `dautuchungkhoan_dautu-pg`.
- Sao lưu: cron 3:00 hằng ngày chạy `scripts/backup-db.sh` → `~/backups/dautu/`, giữ 14 bản.
- Domain `dautu.thangvu.io.vn` đi qua Cloudflare Tunnel (`cloudflared` trên server) → `http://localhost:4200`.
- Đối soát sổ giao dịch với bảng `Holding` (không sửa dữ liệu, thoát mã 1 nếu lệch): `cd ~/apps/dautu/backend && node --env-file=../.env dist/portfolio/reconcile.js`.
- Giá vàng và tỷ giá USDT/VND không có nguồn lịch sử: app tự lưu mỗi ngày (bảng `PriceDaily`, 23:50 và sau mỗi lần khởi động).

### Bật thông báo Telegram

1. Tạo bot với @BotFather (`/newbot`), thêm `TELEGRAM_BOT_TOKEN=...` vào `.env` trên server, `pm2 restart ecosystem.config.cjs --update-env`.
2. Server ở Việt Nam bị chặn `api.telegram.org`: tạo Cloudflare Worker chuyển tiếp (chỉ cho đúng bot của app) rồi đặt `TELEGRAM_API_BASE=https://<worker>.workers.dev`. Log đúng: `Telegram bot @<tên> sẵn sàng`.
3. Link trong tin dùng `APP_URL`, không có thì dùng `FRONTEND_ORIGIN`. Chạy nhiều instance thì đặt `TELEGRAM_POLLING=false` cho các instance phụ.

Người dùng tự kết nối ở Cài đặt → "Nhận thông báo qua Telegram".

## Tính năng

| Phần | Nội dung |
|---|---|
| Bảng giá | VN-Index/VN30/HNX/UPCoM, rổ VN30 (màu trần/sàn/TC, khối ngoại ròng), vàng SJC/DOJI/PNJ/BTMC + chênh lệch với thế giới, top coin Binance, tỷ giá Vietcombank. Đẩy realtime qua socket.io. |
| Hồ sơ nhà đầu tư | Khảo sát 10 câu → kiểu rủi ro (Thận trọng / Cân bằng / Tăng trưởng / Mạo hiểm), khung thời gian, mức lỗ chịu được, cờ "dễ FOMO". |
| Hôm nay | Trang chủ cá nhân: danh mục tăng/giảm hôm nay và do tài sản nào, điểm cần xem lại (lỗ vượt mức chịu được, tập trung, lệch tỷ trọng, sắp chạm mốc, kế hoạch đến hạn), bản tin mới, tin về mã đang giữ / theo dõi. |
| Danh mục & sổ giao dịch | Mua, bán, nạp, rút, cổ tức, phí, nhận cổ phiếu (thưởng / cổ tức cổ phiếu / chia tách), số dư đầu kỳ (Decimal). Giá vốn bình quân gia quyền, lãi đã / chưa chốt, tổng lãi = giá trị − vốn đưa vào (tiền nạp không phải lãi). Chặn bán quá / rút quá, kể cả khi sửa giao dịch cũ; sửa / huỷ có lịch sử. Mỗi giá có trạng thái mới / cũ / dự phòng / thiếu. Coin có hai con số: lãi theo USDT và lãi VND thực tế theo tỷ giá lúc mua. |
| Sự kiện quyền | Đối chiếu sự kiện của Vietcap (cổ phiếu thưởng, cổ tức cổ phiếu / tiền mặt, chia tách) với sổ: sự kiện được hưởng mà chưa ghi được gợi ý với số cổ phiếu / tiền dự kiến, ghi bằng một nút hoặc bỏ qua. |
| Nhập CSV | Xem trước không ghi gì, tự nhận cột (VN/EN, `,` `;` tab), báo lỗi từng dòng, nghi trùng để người dùng chọn, tác động dự kiến; gửi lại không tạo trùng; hoàn tác theo đợt. File mẫu ở nút "Tải file mẫu". |
| Lịch sử tài sản | Giá trị theo ngày dựng lại từ sổ + giá đóng cửa gốc (VNDirect; giá điều chỉnh không khớp số cổ phiếu thật trước sự kiện quyền), nhập lùi ngày tự tính lại, đường vốn đưa vào để tách tiền nạp; lãi và tỷ suất trong kỳ (Modified Dietz), TWR, XIRR quy năm (kỳ từ 90 ngày) và so với VN-Index cùng kỳ (chỉ kết luận hơn / kém khi dữ liệu đủ, kỳ từ 30 ngày và danh mục chủ yếu là cổ phiếu VN). Ngày thiếu / ước tính giá vẽ nhạt. |
| Kế hoạch đầu tư | Lý do mua, điều kiện xem lại / bán, mốc chốt lời / cắt lỗ, ngày xem lại; AI viết nháp (chỉ lưu khi người dùng xác nhận); nhật ký giữ / điều chỉnh / kết thúc; nhắc 8:00 khi đến hạn. |
| Mục tiêu tài chính | Gán % tài sản cho từng mục tiêu (không quá 100% / tài sản), tiến độ, lệch tỷ trọng mong muốn, mô phỏng mức góp / lợi suất giả định. |
| Watchlist | Theo dõi tài sản chưa sở hữu, đặt cảnh báo giá. |
| Dùng thử | `/demo` cho khách: danh mục mẫu định giá bằng giá thật, không đọc dữ liệu người dùng, không gọi AI. |
| Trang cổ phiếu | Biểu đồ nến + MA20/50/200, chỉ báo kỹ thuật, chỉ số tài chính TTM 5 quý, KQKD 5 năm / 6 quý, khuyến nghị Vietcap Research. |
| Cố vấn AI | Chat streaming. Claude gọi công cụ lấy dữ liệu thật (danh mục, toàn cảnh thị trường, phân tích/so sánh cổ phiếu, crypto, vàng, tin tức) và tìm kiếm web cho vĩ mô; mọi con số phải có nguồn. Prompt tập trung chống FOMO và tách góc nhìn dài hạn / ngắn hạn. |
| Cảnh báo chủ động | Mỗi phút: biến động giá tài sản đang giữ vượt ngưỡng (cổ phiếu = ngưỡng, coin ×2, vàng ÷2), giá chạm mốc tự đặt, tỷ giá USD (±0,5%) / USDT (±1%) biến động trong ngày. Mỗi 10 phút: AI đọc tin mới theo lô (CafeF, VnExpress, cả tin thế giới) — nhận ra doanh nghiệp kể cả khi bài chỉ ghi tên ("Hòa Phát" → HPG), chấm điểm tin vĩ mô / địa chính trị 0–5; tin ≥ 4 điểm gửi cho mọi người (tối đa 3 tin/ngày, mỗi chủ đề 1 lần/ngày trừ tin 5 điểm). AI viết lời nhắn theo hồ sơ từng người; chống bắn trùng. |
| Bản tin | Bản tin sáng 8:30 và tổng kết phiên 15:10 (thứ 2–6), tổng kết tuần sáng thứ 7 (bảng số tính từ sổ, AI chỉ viết nhận định; số AI viết được đối chiếu tự động với số đã tính), viết riêng cho từng người, lưu thành cuộc trò chuyện với cố vấn để hỏi tiếp. Chạy qua hàng đợi Postgres: mỗi người mỗi kỳ một bản, thử lại khi lỗi, tiếp tục sau khi server khởi động lại. Bật/tắt và gửi thử ở trang Danh mục. |
| Telegram / Web Push | Người dùng tự kết nối (Telegram: bấm Start với mã một lần; Web Push: cho phép trên trình duyệt / điện thoại); chọn loại tin, giờ yên lặng, tối đa 10 tin/giờ; mặc định không gửi số liệu danh mục ra ngoài app. |
| Đo lường & chi phí | Sự kiện sử dụng lưu trong Postgres (không gửi ra ngoài); `npm run report:usage` ra kích hoạt, D7/D30, bản tin, chất lượng dữ liệu / AI, chi phí AI theo chức năng và theo người. Quota AI mỗi ngày và ngân sách chung kiểm tra phía server. |

## Kiến trúc

```
frontend (React + Vite + MUI)  ──REST /api, SSE chat, socket.io──▶  backend (NestJS)
                                                                         ├─ Postgres (Prisma)
                                                                         ├─ Vietcap  — giá, chỉ số, BCTC, hồ sơ DN
                                                                         ├─ DNSE     — lịch sử giá (dự phòng)
                                                                         ├─ VNDirect — giá đóng cửa gốc cho lịch sử danh mục
                                                                         ├─ Binance  — websocket toàn thị trường
                                                                         ├─ vang.today / BTMC — giá vàng
                                                                         ├─ Vietcombank — tỷ giá
                                                                         ├─ CafeF / VnExpress RSS — tin tức
                                                                         └─ Claude API (claude-opus-5-5)
```

- `contracts/` — kiểu của API dùng chung (yêu cầu / phản hồi), một nguồn sự thật cho cả hai phía; xem `contracts/README.md`.
- `backend/src/advisor/` — system prompt, công cụ và vòng lặp tool-use. Lịch sử hội thoại lưu nguyên khối content của Claude và chỉ nối thêm, để prompt cache và thinking blocks luôn hợp lệ. Bật `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) để yêu cầu bị từ chối được chạy lại trên model dự phòng.
- `backend/src/market/` — `MarketService` giữ giá realtime trong bộ nhớ (poll 3 giây/lần trong phiên 9:00–15:00 VN, 5 phút ngoài phiên; chỉ ở process web). Dữ liệu không realtime (hồ sơ công ty, báo cáo tài chính, sự kiện quyền, bộ lọc…) đi qua `providers/vietcap/` (adapter theo mảng, client HTTP có giới hạn tần suất và cầu dao ngắt) và `cache/` (cache hai tầng: bộ nhớ + bảng `MarketCache` trong Postgres).
- `backend/src/alerts/` — cảnh báo giá, biến động mã đang giữ, vĩ mô, tin tức (mỗi loại một service), gắn nhãn tin bằng AI (`news-tagger.service.ts`, bảng `NewsTag`), bản tin (`briefs.service.ts`, `weekly.service.ts`), soạn và lưu thông báo. Việc chạy định kỳ đặt ở `backend/src/worker/scheduled-jobs.ts`, chạy trong process worker.
- `backend/src/portfolio/` — sổ giao dịch (`ledger.ts` thuần; `transactions.service.ts` ghi có khoá theo người dùng và tính lại `Holding`), định giá (`valuation.ts`), nhập CSV, lịch sử (`history.ts`); module con `analysis/` (thử kịch bản, tái cân bằng) và `dividends/` (gợi ý ghi sổ, thu nhập cổ tức).
- `backend/src/home`, `plans`, `goals`, `watchlist`, `events`, `screener`, `practice`, `journal`, `portfolio-alerts`, `reports`, `telegram`, `push`, `demo` — mỗi tính năng một module theo cùng bố cục: `*.module.ts` chỉ khai báo, controller, service, `dto/`, presenter (dựng phản hồi theo từng trường), và phần tính toán là hàm thuần có test.
- Hai process từ cùng một bản build: `dist/main.js` (web: API, socket, giá realtime) và `dist/worker.js` (cron, hàng đợi bản tin, gửi Telegram / Web Push; mỗi job chạy dưới khoá advisory của Postgres, ghi nhịp tim để deploy kiểm tra). `/api/health` trả cả trạng thái worker.
- `frontend/src/` — `pages/` chỉ là khung trang; gọi API qua `api/<mảng>.ts`; logic tải dữ liệu và form trong `hooks/`; component theo mảng trong `components/<mảng>/`.
- Chi tiết ranh giới module, quy ước thư mục và checklist khi thêm tính năng: [ARCHITECTURE.md](ARCHITECTURE.md).
- `npm test` (unit), `npm run test:int` trong `backend` (PostgreSQL thật) và `npm run lint` đều chạy trong CI. Chi tiết các lớp kiểm thử: [docs/TESTING.md](docs/TESTING.md).

## Lưu ý trước khi mở cho cộng đồng

- **Nguồn dữ liệu**: Vietcap / DNSE / vang.today là API công khai mà web của họ dùng, không có hợp đồng — có thể đổi hoặc chặn bất cứ lúc nào (khi xây dựng đã gặp Vietcap trả lỗi 500 ở một số endpoint, nên có dự phòng). Khi ra thị trường cần nguồn có hợp đồng (SSI FastConnect, FiinTrade…).
- **Pháp lý**: tư vấn đầu tư chứng khoán ở Việt Nam là ngành nghề có điều kiện. Hiện app ghi rõ là phân tích tham khảo; cần tư vấn luật trước khi thu phí hoặc mở rộng.
- **Chi phí AI**: mỗi câu hỏi phân tích gọi nhiều công cụ và có thể tìm web, tốn nhiều token hơn chat thường. App ghi usage và chi phí ước tính từng lần gọi (`npm run report:usage`), có quota và ngân sách ngày; xem [docs/AI_COSTS.md](docs/AI_COSTS.md).
