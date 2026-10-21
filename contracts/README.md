# contracts — hợp đồng API dùng chung

Kiểu (interface / literal union) của mọi yêu cầu và phản hồi giữa `frontend/` và `backend/`. **Chỉ có kiểu, không có mã chạy**:
không `enum`, không hằng, không hàm, nên import nó không làm đổi một byte JavaScript nào. Backend là nguồn sự thật: kiểu ở
đây phải khớp với những gì controller trả về thật sự (compiler kiểm tra, xem dưới).

```
src/
  common.ts       AssetType, Currency, PriceStatus, PriceMeta, DataQuality, OkResponse…
  market.ts       báo giá, snapshot, chi tiết cổ phiếu / coin, nến, chỉ báo kỹ thuật, cổ tức
  portfolio.ts    định giá, giao dịch, hiệu quả, lịch sử, nhập CSV
  analysis.ts     thử kịch bản, tái cân bằng        dividends.ts   sự kiện quyền, lịch thu nhập
  events.ts       lịch sự kiện + nhắc               screener.ts    lọc cổ phiếu, bộ lọc đã lưu
  compare.ts      so sánh cổ phiếu                  practice.ts    luyện tập tiền ảo
  notifications.ts, watchlist.ts, plans.ts, goals.ts, home.ts, demo.ts, auth.ts,
  channels.ts (Telegram / Web Push), news.ts, advisor.ts (gồm sự kiện SSE), health.ts, analytics.ts
  index.ts        export * của tất cả
```

## Dùng thế nào

Cả hai phía import qua alias `@dautu/contracts` và **luôn `import type`** (ESLint chặn import thường):

- **frontend**: `tsconfig.app.json` có `paths` trỏ vào `contracts/src/index.ts`; `src/lib/types.ts` re-export (`export type *`).
  Vite xoá import kiểu nên không cần alias lúc chạy.
- **backend**: `tsconfig.json` (typecheck, ESLint, ts-jest) trỏ `paths` vào **mã nguồn** `contracts/src`; `tsconfig.build.json`
  (nest build / start) trỏ vào **`contracts/dist/index.d.ts`**. Lý do: nếu `nest build` kéo thẳng file nguồn của contracts vào
  chương trình, TypeScript tính lại thư mục gốc chung và `dist/main.js` sẽ dời thành `dist/backend/src/main.js`. Khai báo
  `.d.ts` thì không tham gia việc tính này, nên `dist/main.js` và `dist/worker.js` giữ nguyên chỗ (pm2 và deploy phụ thuộc).
  `contracts/dist` do `npm run build:contracts` (trong `backend/`) dựng, đã gắn vào `prebuild` và `prestart*`; khi sửa contracts
  lúc chạy `start:dev` thì chạy thêm `npm run build:contracts -- --watch`.

## Quy ước

- Thêm / đổi kiểu API ở đây, rồi gắn kiểu trả về cho controller / service (`Promise<Portfolio>`…) để compiler bắt lệch.
- DTO của backend (class-validator, chạy lúc runtime) `implements` interface yêu cầu tương ứng; interface nằm ở đây.
- Thời điểm là chuỗi ISO (`string`): dòng Prisma có `Date` phải đổi bằng `.toISOString()` trước khi gắn kiểu (JSON y hệt).
- Trường chỉ có trong một vài phản hồi thì khai báo optional kèm chú thích nó có khi nào.
