# Đồng Hành Đầu Tư

Web xem giá realtime (cổ phiếu VN, vàng, crypto, tỷ giá) cho nhà đầu tư cá nhân người Việt, kèm một **cố vấn AI** biết hồ sơ rủi ro và danh mục của từng người, phân tích có dẫn nguồn và chủ động cảnh báo khi tài sản biến động.

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

Mở http://localhost:5173, đăng nhập bằng Google hoặc email, làm khảo sát 10 câu, nhập tài sản đang có. Tài khoản mới (kể cả đăng nhập Google lần đầu) luôn được đưa vào khảo sát trước.

### Bật đăng nhập Google

1. Vào https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID** → loại **Web application**.
2. **Authorized JavaScript origins**: thêm `http://localhost:5173` (và domain thật khi deploy).
3. Copy Client ID vào `backend/.env`: `GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"`, khởi động lại backend.

Không có `GOOGLE_CLIENT_ID` thì nút Google tự ẩn. Email đã đăng ký bằng mật khẩu mà sau đó đăng nhập Google (cùng email) sẽ được gộp vào cùng một tài khoản.

Không có `LLM_API_KEY` thì mọi thứ vẫn chạy, trừ chat cố vấn; thông báo biến động vẫn bắn nhưng dùng câu chữ mẫu thay vì lời khuyên cá nhân hoá.

## Deploy (production)

Push lên `main` → GitHub Actions build kiểm tra, rồi self-hosted runner (label `dautu`) trên server tự deploy vào `/home/thangvv/apps/dautu`: rsync code, `docker compose up` Postgres, build, `prisma migrate deploy`, `pm2 startOrReload`, health check `http://127.0.0.1:4200/api/health`. Xem `.github/workflows/deploy.yml`.

- Một process NestJS (pm2 `dautu`, `ecosystem.config.cjs`) phục vụ cả `/api`, socket.io và `frontend/dist`.
- `.env` ở thư mục gốc trên server (không nằm trong git): biến `POSTGRES_*` cho docker compose + toàn bộ biến của backend (`PORT=4200`, `FRONTEND_ORIGIN=https://dautu.thangvu.io.vn`…).
- Postgres 16 trong Docker, chỉ mở `127.0.0.1:5434`, dữ liệu ở volume cố định `dautuchungkhoan_dautu-pg`.
- Sao lưu: cron 3:00 hằng ngày chạy `scripts/backup-db.sh` → `~/backups/dautu/`, giữ 14 bản.
- Domain `dautu.thangvu.io.vn` đi qua Cloudflare Tunnel (`cloudflared` trên server) → `http://localhost:4200`.

## Tính năng

| Phần | Nội dung |
|---|---|
| Bảng giá | VN-Index/VN30/HNX/UPCoM, rổ VN30 (màu trần/sàn/TC, khối ngoại ròng), vàng SJC/DOJI/PNJ/BTMC + chênh lệch với thế giới, top coin Binance, tỷ giá Vietcombank. Đẩy realtime qua socket.io. |
| Hồ sơ nhà đầu tư | Khảo sát 10 câu → kiểu rủi ro (Thận trọng / Cân bằng / Tăng trưởng / Mạo hiểm), khung thời gian, mức lỗ chịu được, cờ "dễ FOMO". |
| Danh mục | Cổ phiếu, vàng (theo lượng), coin (giá vốn USDT), tiền mặt. Định giá theo thị trường, lãi/lỗ, tỷ trọng. |
| Trang cổ phiếu | Biểu đồ nến + MA20/50/200, chỉ báo kỹ thuật, chỉ số tài chính TTM 5 quý, KQKD 5 năm / 6 quý, khuyến nghị Vietcap Research. |
| Cố vấn AI | Chat streaming. Claude gọi công cụ lấy dữ liệu thật (danh mục, toàn cảnh thị trường, phân tích/so sánh cổ phiếu, crypto, vàng, tin tức) và tìm kiếm web cho vĩ mô; mọi con số phải có nguồn. Prompt tập trung chống FOMO và tách góc nhìn dài hạn / ngắn hạn. |
| Cảnh báo chủ động | Mỗi phút: biến động giá tài sản đang giữ vượt ngưỡng (cổ phiếu = ngưỡng, coin ×2, vàng ÷2), giá chạm mốc tự đặt, tỷ giá USD (±0,5%) / USDT (±1%) biến động trong ngày. Mỗi 10 phút: AI đọc tin mới theo lô (CafeF, VnExpress, cả tin thế giới) — nhận ra doanh nghiệp kể cả khi bài chỉ ghi tên ("Hòa Phát" → HPG), chấm điểm tin vĩ mô / địa chính trị 0–5; tin ≥ 4 điểm gửi cho mọi người (tối đa 3 tin/ngày, mỗi chủ đề 1 lần/ngày trừ tin 5 điểm). AI viết lời nhắn theo hồ sơ từng người; chống bắn trùng. |
| Bản tin | Bản tin sáng 8:30 và tổng kết phiên 15:10 (thứ 2–6), viết riêng cho từng người, lưu thành cuộc trò chuyện với cố vấn để hỏi tiếp. Bật/tắt và gửi thử ở trang Danh mục. |

## Kiến trúc

```
frontend (React + Vite + MUI)  ──REST /api, SSE chat, socket.io──▶  backend (NestJS)
                                                                         ├─ Postgres (Prisma)
                                                                         ├─ Vietcap  — giá, chỉ số, BCTC, hồ sơ DN
                                                                         ├─ DNSE     — lịch sử giá (dự phòng)
                                                                         ├─ Binance  — websocket toàn thị trường
                                                                         ├─ vang.today / BTMC — giá vàng
                                                                         ├─ Vietcombank — tỷ giá
                                                                         ├─ CafeF / VnExpress RSS — tin tức
                                                                         └─ Claude API (claude-opus-5-5)
```

- `backend/src/advisor/` — system prompt, công cụ và vòng lặp tool-use. Lịch sử hội thoại lưu nguyên khối content của Claude và chỉ nối thêm, để prompt cache và thinking blocks luôn hợp lệ. Bật `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) để yêu cầu bị từ chối được chạy lại trên model dự phòng.
- `backend/src/market/` — các provider và `MarketService` giữ trạng thái giá trong bộ nhớ, poll 3 giây/lần trong phiên (9:00–15:00 VN), 5 phút ngoài phiên.
- `backend/src/alerts/` — quét định kỳ, gắn nhãn tin bằng AI (`news-tagger.service.ts`, kết quả lưu bảng `NewsTag`), bản tin (`briefs.service.ts`), cảnh báo mốc giá, soạn thông báo.

## Lưu ý trước khi mở cho cộng đồng

- **Nguồn dữ liệu**: Vietcap / DNSE / vang.today là API công khai mà web của họ dùng, không có hợp đồng — có thể đổi hoặc chặn bất cứ lúc nào (khi xây dựng đã gặp Vietcap trả lỗi 500 ở một số endpoint, nên có dự phòng). Khi ra thị trường cần nguồn có hợp đồng (SSI FastConnect, FiinTrade…).
- **Pháp lý**: tư vấn đầu tư chứng khoán ở Việt Nam là ngành nghề có điều kiện. Hiện app ghi rõ là phân tích tham khảo; cần tư vấn luật trước khi thu phí hoặc mở rộng.
- **Chi phí AI**: mỗi câu hỏi phân tích gọi nhiều công cụ và có thể tìm web, tốn nhiều token hơn chat thường. Theo dõi usage trên Claude Console.
