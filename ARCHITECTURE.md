# Kiến trúc Đồng Hành Đầu Tư

Modular monolith: một codebase NestJS 11 + Prisma (PostgreSQL), một gói kiểu dùng chung, một ứng dụng React. Tài liệu này mô tả code **đang chạy**; vận hành production nằm ở `docs/`.

```
backend/     NestJS API + worker (src/main.ts, src/worker.ts)
contracts/   @dautu/contracts: kiểu request/response dùng chung cho backend và frontend (chỉ kiểu)
frontend/    React + Vite (xem mục Frontend)
```

## 1. Hai process từ một codebase

| | web (`dautu`) | worker (`dautu-worker`) |
|---|---|---|
| Điểm vào | `src/main.ts` → `AppModule` | `src/worker.ts` → `WorkerModule` (application context, không HTTP) |
| Làm gì | API `/api/*`, socket.io, phục vụ bản build React, **poll giá realtime** cho bảng giá | cron, hàng đợi bản tin, gửi Telegram / Web Push, nhịp tim |
| Không làm | cron, hàng đợi, gửi thông báo (không có `ScheduleModule`) | HTTP, websocket Binance, poll bảng giá |
| Lấy giá | liên tục (`MarketService.onApplicationBootstrap`) | theo yêu cầu: `MarketService.ensureFresh()` ngay trước việc cần giá |

- Vai trò khai báo bằng `declareAppRole()` ở điểm vào, đọc qua `AppRuntime` (`runtime/app-role.ts`); `.env` dùng chung không đổi được vai trò. `ecosystem.config.cjs` chạy hai app pm2.
- **Chỉ `worker/scheduled-jobs.ts` khai báo `@Cron` / `@Interval`** (bảng lịch ở đầu file). Logic nghiệp vụ nằm ở các service, file đó chỉ có lịch + tên khoá.
- Vòng lặp không phải cron (nhịp tim, hàng đợi bản tin, gửi Telegram / Web Push, đọc macro khi cũ, ghi giá lúc khởi động) bật trong `worker/worker-lifecycle.ts`.
- Web có các service đủ để phục vụ request (xếp việc, lưu cài đặt, gửi thử), không bao giờ tự chạy việc nền.

## 2. Bản đồ module

Phụ thuộc đi một chiều: tầng dưới không import tầng trên.

| Tầng | Module | Ghi chú |
|---|---|---|
| Hạ tầng (global) | `PrismaModule`, `RuntimeModule`, `AnalyticsModule`, `AiModule` | DB, vai trò process + JobRunner + heartbeat, đo hành vi, hạn mức AI |
| Định danh | `AuthModule` | JWT, Google login; export `JwtAuthGuard`, `OptionalJwtAuthGuard`, `CurrentUser` |
| Dữ liệu thị trường | `MarketModule` (+ `VietcapModule`, `MarketCacheModule`), `MacroModule`, `NewsModule`, `LogosModule` | không phụ thuộc module nghiệp vụ nào |
| Lõi danh mục | `PortfolioModule` | định giá, sổ giao dịch, nhập CSV, lịch sử. Import `MarketModule` |
| Phân tích danh mục | `AnalysisModule` (mô phỏng, tái cân bằng), `DividendsModule` (cổ tức, sự kiện quyền) | phụ thuộc `PortfolioModule`, không import ngược |
| Tính năng người dùng | `ProfileModule`, `WatchlistModule`, `GoalsModule`, `PlansModule`, `JournalModule`, `PracticeModule`, `ScreenerModule`, `ReportsModule`, `HomeModule`, `DemoModule`, `EventsModule` | |
| Thông báo | `AlertsModule` (giá, tin, bản tin, inbox), `PortfolioAlertsModule`, `TelegramModule`, `PushModule` | `AlertsModule` ghi `Notification` và xếp hàng gửi; Telegram / Push chỉ gửi |
| Cố vấn AI | `AdvisorModule` | công cụ (`tools.ts`) đọc dữ liệu qua các service ở trên |

Ranh giới cần giữ: `MarketModule` không biết người dùng; `PortfolioModule` không import `AnalysisModule` / `DividendsModule`; Telegram / Push không import `AlertsModule` (đọc bảng `Notification` qua Prisma); module nào cũng đi qua service của module khác, không đọc bảng của module khác tuỳ tiện khi đã có service cho việc đó.

## 3. Quy ước thư mục theo module

```
<x>/
  <x>.module.ts        chỉ nối dây (imports / controllers / providers / exports)
  <x>.controller.ts    HTTP: bind input, gọi service, trả kết quả. Không logic, không Prisma
  <x>.service.ts       điều phối nghiệp vụ + truy cập DB. Tách theo trách nhiệm khi một service làm nhiều việc
  dto/<x>.dto.ts       class-validator, `implements` interface trong @dautu/contracts
  <x>.logic.ts | tên domain  logic thuần (không DB, không mạng, không Nest), có unit test
  <x>.presenter.ts     dòng Prisma → kiểu hợp đồng, dựng từng trường
```

- Một service chỉ có một lý do để đổi. Ví dụ: `alerts/` tách `PriceAlertsService` (mốc giá), `HoldingMoveAlerts`, `MacroAlerts`, `NewsAlerts`, `PersonalAlertService` (AI viết lời nhắn + gửi), `AlertsService` (điểm vào của cron); `telegram/` tách `TelegramLinkService` (liên kết, cài đặt), `TelegramDeliveryService` (hàng đợi gửi), `TelegramPollerService` (long polling), `TelegramService` (vòng đời); `push/` tách subscription / delivery / sender (VAPID).
- Service nhận phụ thuộc qua constructor; test dựng bằng tay (`new XService(fakeA, fakeB)`).
- Tránh barrel `index.ts` (dễ sinh vòng import). Kiểm tra: `npx madge --circular --extensions ts src` (chỉ còn vòng trong `contracts/`, toàn kiểu).
- Thêm export mới chỉ khi có người import ngoài file; `npx knip` dùng để dò export / file / dependency thừa. CLI (`analytics/report-cli`, `alerts/brief-jobs-cli`, `runtime/worker-check-cli`, `portfolio/reconcile`, `eval/run-eval`) là điểm vào riêng, đừng xoá vì không ai import.

## 4. Hợp đồng API (`@dautu/contracts`)

- Chỉ có kiểu: `interface` và union literal, **không có mã chạy**. ESLint chặn `import` thường từ `@dautu/contracts` (bắt buộc `import type`).
- Backend là nguồn sự thật: kiểu khớp đúng cái controller trả về. Build bằng `npm run build:contracts` (chạy tự động trước `build` / `start`).
- DTO request là class-validator `implements` interface hợp đồng, nên đổi hợp đồng mà quên DTO sẽ không biên dịch được.
- Response dựng **từng trường** trong presenter (`toMe`, `toPriceAlert`, `toTransactionView`, `toPlan`, ...), không `...row` từ Prisma, để cột nội bộ (`userId`, `passwordHash`, `planId`, `hash`, ...) không bao giờ lọt ra ngoài. Ngoại lệ có chủ đích được ghi chú trong presenter (`toNotificationView` giữ mọi cột của `Notification`).
- Đổi hình dạng response: sửa `contracts/src/<x>.ts`, presenter, rồi frontend.

## 5. Tầng dữ liệu thị trường (`backend/src/market`)

```
MarketService ─ trạng thái giá trong bộ nhớ (cổ phiếu, vàng, tỷ giá, USDT), nguồn + độ mới
  ├─ price-info.ts        hàm thuần: priceInfo / priceVnd / dayChangePct từ `PriceBook`
  ├─ on-demand-gate.ts    worker: mỗi nguồn chỉ gọi lại khi tới chu kỳ, lỗi thì thử lại sau 30 giây
  ├─ freshness.ts         trạng thái giá: fresh / stale / fallback / missing (không bao giờ bịa số)
  └─ providers/
       vietcap/   VietcapModule: 1 HttpClient + 8 adapter theo miền (quotes, symbols, history, company, statements, ownership, events, screening)
       binance.provider.ts (websocket + REST), gold-fx.provider.ts (vang.today / BTMC / Vietcombank / P2P), vndirect.provider.ts
StockResearchService / CompareService ─ ghép adapter + cache thành chi tiết cổ phiếu, báo cáo tài chính, so sánh
```

- **Adapter Vietcap** đi qua `VietcapHttpClient`: **rate limiter** token bucket riêng cho từng máy chủ (`trading`, `iq`, `dnse`), thử lại có backoff với 429 / 5xx, **circuit breaker** theo máy chủ (5 lỗi liên tiếp thì ngắt 30 giây, tăng dần tới 5 phút).
- **`MarketDataCache`** (`market/cache`): đệm hai tầng cho dữ liệu không realtime. L1 LRU trong process, L2 bảng `MarketCache` trong PostgreSQL (sống qua deploy). Đọc read-through có single-flight; nguồn lỗi hoặc mạch đang mở thì trả bản cũ trong `staleMs`; lỗi DB không làm hỏng lần đọc. Chính sách và phiên bản khoá theo miền ở `vietcap-cache-policy.ts` (đổi hình dạng dữ liệu thì tăng số phiên bản). Job `market-cache.purge` dọn dòng hết hạn.
- Nguồn lỗi thì giữ dữ liệu cũ và gắn nhãn (`stale`, `fallback`, `missing`); tính năng cảnh báo bỏ qua thay vì suy ra từ giá thiếu.

### Tìm tin (`backend/src/news/search`)

```
NewsService (RSS báo Việt) + CryptoNewsService (tin coin) + bảng NewsTag (mã, mức quan trọng)
  └─ NewsDocsService.current() ─ gộp thành NewsDoc (kind stock | coin, tickers, importance)
       └─ worker: NewsIndexerService ─ news.index (20 giây sau khi chạy, rồi mỗi 5 phút)
            ├─ NewsArticleRepository.upsert ─ bảng NewsArticle (kho gốc, 180 ngày, cột searchVector + GIN)
            └─ đưa tin có indexedAt null / cũ hơn updatedAt sang OpenSearch (_bulk), đánh dấu indexedAt
web: NewsSearchService ─ GET /api/news: OpenSearch; chưa cấu hình / lỗi → tìm toàn văn trên NewsArticle (cùng hình dạng kết quả)
```

- **`NewsArticle` là kho gốc**, OpenSearch chỉ là chỉ mục dựng lại được. Mỗi tin đã sang OpenSearch được đánh dấu `indexedAt` (chỉ khi tin chưa đổi thêm từ lúc đọc), nên OpenSearch lỗi một lúc thì lượt sau đưa bù. Index chưa có (lần đầu, đổi tên index khi đổi mapping, bị xoá) thì worker tạo lại rồi nạp lại toàn bộ kho từ DB, tối đa 10.000 tin mỗi lượt. `news.purge` (3:40) xoá tin quá 180 ngày ở cả hai nơi.
- **OpenSearch**: server dùng Amazon OpenSearch Service (`OPENSEARCH_URL` + master user của fine-grained access control); local dùng container `docker compose --profile search up -d` (cổng 9201). Không đặt `OPENSEARCH_URL` thì chỉ tìm trên PostgreSQL. Mỗi trường chữ có hai bản: giữ dấu (`vi_exact`) và `.fold` bỏ dấu (`asciifolding`, cả `đ → d`); khớp đúng dấu và khớp cụm ở tiêu đề được cộng điểm. Lọc loại tin / chủ đề / nguồn nằm ở `post_filter`, mỗi bộ đếm bỏ đúng bộ lọc của nó.
- **Tìm toàn văn PostgreSQL** (dự phòng): `searchVector` do app ghi cùng lúc với nội dung (`setweight` tiêu đề + mã = A, tóm tắt = B), từ chữ đã bỏ dấu bằng `foldVi` với cấu hình `simple` — không cần từ điển tiếng Việt hay extension `unaccent` (âm tiết tiếng Việt cách nhau bằng khoảng trắng). Câu tìm chỉ giữ chữ / số rồi mới đưa vào `to_tsquery`; xếp theo `ts_rank` + điểm cộng khi tiêu đề có nguyên cụm, giảm một nửa sau mỗi 7 ngày. OpenSearch lỗi thì web ghi log và tìm trên PostgreSQL 60 giây rồi mới thử lại.
- Cột thời gian Prisma là `timestamp` chứa giờ UTC còn phiên PostgreSQL chạy giờ Việt Nam: SQL viết tay dùng `now() AT TIME ZONE 'UTC'`, không dùng `now()` trần.
- **Tô sáng**: OpenSearch đánh dấu chỗ khớp bằng ký tự vùng dùng riêng (`news-highlight.ts`), PostgreSQL thì app tự tìm chỗ khớp trọn từ (`termRanges`); cả hai đổi thành `TextPart[]` (`{ text, hit }`) nên frontend không bao giờ render HTML từ server. Các từ khớp liền nhau gộp thành một đoạn.

## 6. Việc nền

- **`JobRunner`** (`runtime/job-runner.ts`): mỗi lượt giành **khoá tư vấn PostgreSQL** theo tên việc (`pg_try_advisory_xact_lock`, gắn với một giao dịch nên tự nhả khi commit / kết nối chết). Hai worker (hoặc worker cũ + mới lúc `pm2 reload`) không bao giờ chạy trùng một việc; ai không giành được thì bỏ lượt. Có hạn tối đa mỗi lượt, và chờ việc đang chạy khi tắt (`WORKER_SHUTDOWN_GRACE_MS`, mặc định 25 giây).
- **Heartbeat** (`runtime/heartbeat.service.ts`): worker ghi bảng `WorkerHeartbeat` mỗi 30 giây; quá 90 giây là chết. `GET /api/health` trả `worker` từ đây; bước deploy chạy `worker-check-cli` để chắc worker **mới** đã sống (khởi động sau mốc reload, nhịp còn mới).
- Hàng đợi bản tin (`BriefQueueService`: `UPDATE … FOR UPDATE SKIP LOCKED`, việc `running` của process đã chết được đưa lại hàng đợi) và gửi Telegram / Web Push không cần khoá `JobRunner`: mỗi tin được nhận bằng cập nhật có điều kiện (`pending → sending`).
- Mọi việc định kỳ: xem bảng ở đầu `worker/scheduled-jobs.ts` (bản tin sáng / chiều / tuần, nhắc kế hoạch, tổng kết nhật ký tháng, nhắc sự kiện, ghi giá cuối ngày, cảnh báo danh mục, dọn analytics và cache, cảnh báo giá mỗi phút, tin mỗi 10 phút, lưu tin vào kho + OpenSearch mỗi 5 phút, macro mỗi 2 giờ).

## 7. Kiểm thử và database

| Lớp | Lệnh | File | DB / phụ thuộc |
|---|---|---|---|
| Unit | `cd backend && npx jest` | `*.spec.ts` | không DB, không mạng; Prisma / market giả |
| Tích hợp | `TEST_DATABASE_URL=…/dautu_test npm run test:int` | `*.int-spec.ts` | PostgreSQL thật, DB tên kết thúc `_test` (code từ chối DB khác) |
| Hành vi frontend | `npm test` trong `frontend/` (Vitest, jsdom) | `frontend/src/**/*.test.ts` | không backend: `api/` giả lập bằng `vi.mock`, phản hồi hoàn tất theo thứ tự test chọn |
| Kho tin + tìm tin | `npm run test:int -- src/news` (thêm `OPENSEARCH_TEST_URL=http://localhost:9201` để chạy cả phần OpenSearch) | `news-search.int-spec.ts` | PostgreSQL `dautu_test`; OpenSearch thật (index tạm, xoá khi xong), không có biến thì bỏ qua phần đó |
| E2E giao diện | `npx playwright test` trong `frontend/` | `frontend/e2e/*.spec.ts` | web + worker chạy trên DB **`dautu_e2e`**, seed bằng `npm run seed:e2e` (script từ chối DB không kết thúc `_e2e`) |

- `dautu_test` chỉ dành cho integration test: `test:int` xoá và tạo dữ liệu ở đó, nên **không chạy web / worker trên `dautu_test`** (tranh hàng đợi, test chập chờn). Server cho e2e luôn dùng `dautu_e2e`.
- Dev local: Postgres Docker cổng 5434 (`docker compose up -d`). Không trỏ test hay seed vào DB production.
- Schema: Prisma migrations (`backend/prisma/migrations`); không sửa migration đã áp.
- Kiểm tra trước khi gộp: `tsc --noEmit`, `eslint "src/**/*.ts" --max-warnings 0`, `jest`, `test:int`.

## 8. Thêm một tính năng: checklist

1. **Hợp đồng**: thêm kiểu request / response vào `contracts/src/<x>.ts`, export ở `index.ts`; `npm run build:contracts`.
2. **DB** (nếu cần): sửa `prisma/schema.prisma`, tạo migration (`prisma migrate dev`), không sửa migration cũ.
3. **Logic thuần**: viết `<x>.logic.ts` + `*.spec.ts` trước; không import Nest / Prisma.
4. **Service**: `<x>.service.ts` nhận phụ thuộc qua constructor; lỗi nghiệp vụ ném `HttpException` phù hợp. Việc dùng chung giữa nhiều service thì tách service nhỏ, đừng nhồi vào một file.
5. **Presenter**: `<x>.presenter.ts` dựng từng trường theo kiểu hợp đồng.
6. **DTO**: `dto/<x>.dto.ts`, class-validator, `implements` interface hợp đồng.
7. **Controller** mỏng + `@UseGuards(JwtAuthGuard)` (hoặc `OptionalJwtAuthGuard` cho trang công khai), kiểu trả về khai báo rõ.
8. **Module** `<x>.module.ts` chỉ nối dây; đăng ký trong `AppModule` (và `WorkerModule` nếu worker cần).
9. **Việc nền** (nếu có): thêm phương thức vào service, rồi thêm một dòng `@Cron` / `@Interval` trong `worker/scheduled-jobs.ts` bọc bằng `JobRunner.run('<tên>', …)`; cập nhật bảng lịch ở đầu file.
10. **Test**: unit cho logic + presenter; `*.int-spec.ts` cho thứ phụ thuộc DB (khoá, transaction, chống trùng); e2e khi đổi giao diện.
11. **Kiểm tra**: `tsc`, `eslint`, `jest`, `test:int`, `npx madge --circular --extensions ts src`, `npx knip`.

## Frontend

React 19 + Vite + MUI v7 + react-router, TypeScript strict, mã nguồn ở `frontend/src`. Không dùng thư viện quản lý dữ liệu (react-query, redux...): trạng thái tải là `useState` / hook nhỏ trong `hooks/`.

### Cấu trúc thư mục

```
frontend/src
├── main.tsx, App.tsx, AuthedRoutes.tsx   điểm vào, nhánh khách, nhánh đã đăng nhập (xem "Định tuyến")
├── pages/<Name>Page.tsx                  container: một trang = một route, đúng tên route
├── components/
│   ├── ui.tsx, Sheet.tsx, ...            UI kit và thành phần dùng chung nhiều miền
│   └── <domain>/                         thành phần của một miền: portfolio, events, income, screener, ...
├── api/<domain>.ts                       tầng dữ liệu: mỗi endpoint một hàm có kiểu
├── hooks/use*.ts                         trạng thái tải / logic tương tác dùng lại được
├── lib/                                  hàm thuần (không React hoặc chỉ context): format, tính toán, nhãn, kiểu
└── theme.ts, vite-env.d.ts
```

Quy tắc phụ thuộc (một chiều): `pages` → `components` → `hooks` → `api` / `lib`. `lib/` không import `components/` (trừ `lib/auth.tsx`, `lib/chat.tsx`, `lib/market.tsx` là provider context). `api/` không import React.

- **Trang = container**: lấy tham số URL, gọi hook dữ liệu, giữ vài state giao diện (sheet nào đang mở, tab nào), ghép các thành phần. Không có URL API, không có công thức, không có bảng nhãn nghiệp vụ trong file trang. Mức tham khảo: một trang dưới ~300 dòng; lớn hơn thì tìm đường nối (panel, bảng, form, hook).
- **`components/<domain>/`**: thành phần có nghiệp vụ của miền đó (`portfolio/HoldingsTable`, `income/DismissSheet`, `screener/ResultsPanel`...). Nhận dữ liệu và callback qua props, hoặc gọi hook / `api/` nếu là panel tự tải (`stock/StockFundamentals`, `portfolio/HistoryPanel`). Có từ 2 thành phần trở lên của cùng một miền thì lập thư mục; thành phần dùng ở nhiều miền (`AssetAvatar`, `SearchDialog`, `PriceChart`, `Sheet`, `ui.tsx`) nằm ở gốc `components/`.
- **`hooks/`**: `useResource` (tải GET + `error` / `reload` / làm mới định kỳ), `useAssetDetail`, `usePortfolioData`, `useHeldPortfolio`, `useSimulation`, `useRebalance`, `useScreenRun`, ... Hook gọi `api/` và trả `{ data, loading, error, ... }`; không dựng JSX.
- **`lib/<domain>.ts`**: hàm thuần có thể test không cần DOM (`lib/tx.ts: buildTransactionBody`, `lib/goals.ts: buildGoalRequest`, `lib/portfolioAlerts.ts: draftError`, `lib/simulate.ts`, `lib/rebalance.ts`). Logic kiểm tra form và dựng thân request nằm ở đây, component chỉ gọi.

### Tầng dữ liệu `src/api`

- `client.ts`: `api` / `post` / `put` / `patch` / `del`, `streamPost` (SSE), `ApiError`, `getToken` / `setToken`. Gắn `Authorization`, gặp 401 thì xoá token và chuyển tới `/login?next=...`. Đây là chỗ **duy nhất** gọi `fetch` tới `/api` cho JSON; endpoint trả file dùng `files.ts` (`fetchFile`, `saveBlob`), `analytics.ts` gửi sự kiện bằng `keepalive`.
- `query.ts`: `qs({...})` dựng query, bỏ giá trị rỗng. Dựng URL / mã hoá tham số **chỉ ở `api/`**.
- Mỗi file `api/<domain>.ts` export một hàm cho mỗi endpoint, kiểu request / response lấy từ `@dautu/contracts` (qua `lib/types.ts`): `portfolio` (sổ, vị thế, giao dịch, nhập CSV, thu nhập, sự kiện quyền), `market`, `search`, `gold`, `events`, `screener`, `analysis` (mô phỏng, tái cân bằng), `goals`, `plans`, `alerts`, `portfolioAlerts`, `journal`, `reports`, `practice`, `watchlist`, `notifications`, `channels` (Telegram, Web Push), `auth` (+ hồ sơ, khảo sát), `advisor`, `advisorChat` (SSE), `home`, `news`, `demo`, `analytics`.
- Tách `search`, `gold`, `advisorChat` khỏi `market`, `portfolio`, `advisor` là có chủ đích: chúng được dùng trong chunk vỏ app (`AuthedRoutes`), các hàm còn lại chỉ dùng trong chunk của từng trang. Nếu gom chung một module thì Rollup kéo cả module vào chunk vỏ và tăng JS tải đầu. Khi thêm hàm `api/` mới, kiểm tra sizes của `index` / `AuthedRoutes` sau `vite build`.
- Component và trang **không** import `api` / `post` thô; chỉ `ApiError` được import từ `api/client` để phân biệt mã lỗi.

### Định tuyến và chunk

- `App.tsx`: khách (`/login`, `/register`, `/demo`) tải rất ít; có phiên đăng nhập thì `lazy(() => import('./AuthedRoutes'))`.
- `AuthedRoutes.tsx`: vỏ app (`components/layout/Layout`, socket.io, trang chủ) nằm chung một chunk; **mỗi trang khác một chunk** qua `lazy` + `Suspense`. Thêm trang mới: thêm một dòng `lazy`, một `<Route>`.
- `vite.config.ts` (`manualChunks`): `vendor-react` (react, router), `vendor-mui` (MUI mà trang đăng nhập cần), `vendor-mui-shell` (MUI chỉ vỏ đã đăng nhập dùng, khách không phải tải), `vendor-socket` (socket.io-client, tải động). Phần còn lại do Rollup gom theo trang. Khối nặng (biểu đồ `lightweight-charts`, `react-markdown`) chỉ nằm trong chunk trang dùng chúng.
- Số liệu để so sau mỗi thay đổi lớn: `npx vite build --outDir <thư mục tạm> --emptyOutDir`, rồi so kích thước (gzip) của `index`, `AuthedRoutes` và các `vendor-*` (đây là JS tải đầu). `npm run build` còn nén sẵn `.br` / `.gz` (`scripts/compress.mjs`); `npm run perf:load` đo thời gian tải (`scripts/loadtime.mjs`).

### Hợp đồng API

Kiểu request / response chỉ định nghĩa ở `contracts/src` (xem mục 4). Frontend import qua `lib/types.ts` (`export type * from '@dautu/contracts'`), luôn `import type`; ESLint chặn import thường. Đổi hình dạng response: sửa `contracts/`, presenter backend, rồi hàm trong `api/<domain>.ts` và nơi dùng; **không** tự khai báo lại kiểu response trong component.

### UI kit

- `components/ui.tsx`: `Panel`, `KV`, `Stat`, `InfoTip`, `ChangePill`, `DialogHeader`, `Logo`... — khối giao diện dùng lại, thống nhất khoảng cách và kiểu chữ.
- `components/Sheet.tsx`: ngăn kéo từ dưới lên (bottom sheet) cho thao tác trên điện thoại; hộp thoại dùng `Dialog fullScreen={mobile}` + `DialogHeader`.
- `lib/layout.ts` (`STICKY_TOP`), `lib/format.ts` (số, tiền, ngày theo vi-VN), `lib/useIsMobile.ts`. Màu / theme ở `theme.ts` (biến CSS của MUI, có chế độ tối); không hard-code màu mới nếu theme đã có.
- Giao diện ưu tiên điện thoại: vùng bấm >= 44px, ô nhập chữ >= 16px (Safari iOS tự phóng to nếu nhỏ hơn), không tràn ngang, hộp thoại không vượt màn hình. `e2e/audit.ts` kiểm các điều này.

### Kiểm thử

- **Hook / logic** (`src/**/*.test.ts`, Vitest + Testing Library, chạy trong CI): kiểm hành vi bất đồng bộ không cần trình duyệt. Mock module `api/` bằng `vi.mock`, mỗi lần gọi trả một `deferred()` (`src/test/deferred.ts`) để test tự chọn thứ tự phản hồi về: đổi tham số khi request cũ chưa xong, phản hồi / lỗi cũ về muộn, polling chồng lên lần tải sau khi ghi, huỷ khi gỡ component. Hook tải dữ liệu theo tham số (danh mục, bộ lọc) phải chỉ nhận phản hồi của request gần nhất — xem `usePortfolioData`, `useScreenRun`, `useResource`.
- **Playwright mobile** (`frontend/e2e`): iPhone 11 Pro, WebKit (cùng engine Safari iOS). `mobile.spec.ts` đi qua mọi màn hình và mở từng modal / ngăn kéo, ghi ảnh vào `frontend/e2e-results/` (đã gitignore) và chạy `audit()`; màn nào có lỗi bố cục thì thất bại. `auth-flow.spec.ts`, `chart.spec.ts` cho đăng nhập và biểu đồ; `races.spec.ts` giữ chậm request bằng `page.route` để kiểm phản hồi về không theo thứ tự trên giao diện thật.
- **Database cho e2e**: dùng DB riêng tên kết thúc `_e2e` hoặc `_e2e_<hậu tố>` (ví dụ `dautu_e2e`, `dautu_e2e_fe`), **không** dùng `dautu_test` (`npm run test:int` xoá dữ liệu ở đó, worker đang chạy sẽ tranh hàng đợi với test) và không bao giờ trỏ vào production.
- Quy trình: build backend ra thư mục tạm (`cd backend && npm run build:contracts && npx tsc -p tsconfig.build.json --outDir <tmp>/be --incremental false`), build frontend ra thư mục tạm (`npx vite build --outDir <tmp>/fe --emptyOutDir`; không build vào `frontend/dist` khi web dev đang phục vụ thư mục đó), chạy web (`APP_ROLE=web`, `WEB_DIST=<tmp>/fe`) và worker (`APP_ROLE=worker`) với `DATABASE_URL` của DB e2e, `JWT_SECRET` tạm, không đặt khoá Telegram / VAPID / LLM. Seed tài khoản có dữ liệu bằng `node backend/scripts/seed-e2e.js` (in ra JWT), rồi:
  `E2E_BASE_URL=http://localhost:<cổng> E2E_TOKEN=<jwt> npx playwright test`
- Trước khi gộp, frontend phải qua: `npx tsc -b`, `npx eslint . --max-warnings 0`, `npm test`, `npx vite build`, Playwright mobile (0 lỗi audit), `npx knip` (không còn file / export / dependency thừa; cấu hình ở `frontend/knip.json`).
- Refactor cấu trúc không đổi giao diện: chụp ảnh các trang nặng trước / sau cùng dữ liệu rồi so điểm ảnh (ImageMagick `compare -metric AE`).

### Thêm một trang: checklist

1. **Hợp đồng**: kiểu response (và request) trong `contracts/src/<x>.ts`, export ở `index.ts`.
2. **API**: `src/api/<domain>.ts`, mỗi endpoint một hàm có kiểu; query dựng bằng `qs`. Chỉ gom vào module có sẵn nếu cùng miền *và* cùng chunk dùng.
3. **Logic thuần**: `src/lib/<domain>.ts` (nhãn, công thức, kiểm tra form, dựng body); viết trước, giữ không phụ thuộc React.
4. **Hook** (nếu có trạng thái tải / làm mới / debounce dùng lại): `src/hooks/use<Name>.ts`, bắt đầu từ `useResource` nếu chỉ là GET.
5. **Thành phần**: `src/components/<domain>/...` — panel, bảng, form, sheet; props rõ kiểu, callback `onX`.
6. **Trang**: `src/pages/<Name>Page.tsx` là container mỏng, `export default`.
7. **Route**: `AuthedRoutes.tsx` thêm `lazy(() => import('./pages/<Name>Page'))` và `<Route path=... element={page(<NamePage />)}`; nếu có trong menu thì thêm vào `components/layout/navConfig.ts` (`NAV` / `MORE` / `BOTTOM`).
8. **Điện thoại**: kiểm tra 375px, vùng bấm, cỡ chữ ô nhập, trạng thái tải / lỗi / trống.
9. **e2e**: thêm một scenario vào `e2e/mobile.spec.ts` (đường dẫn + thao tác mở modal nếu có), chạy với DB e2e.
10. **Kiểm tra**: `npx tsc -b`, `npx eslint . --max-warnings 0`, `npx knip`, so sizes `vite build`, Playwright.
