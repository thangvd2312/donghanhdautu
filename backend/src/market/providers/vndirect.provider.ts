import { Injectable } from '@nestjs/common';

/** Một phiên: giá đóng cửa gốc (VND, giá khớp thật hôm đó) và giá đã điều chỉnh theo sự kiện quyền */
interface RawClose {
  date: string;
  close: number;
  adjClose: number;
}

const BASE = 'https://api-finfo.vndirect.com.vn/v4/stock_prices';
const PAGE = 1000;

/**
 * Giá lịch sử GỐC của cổ phiếu từ VNDirect finfo (công khai, không cần key). Vietcap / DNSE chỉ có giá đã điều chỉnh
 * lùi theo cổ phiếu thưởng / cổ tức, không khớp với số lượng thật trong sổ giao dịch trước ngày sự kiện.
 */
@Injectable()
export class VndirectProvider {
  private cache = new Map<string, { at: number; rows: RawClose[] }>();

  async rawCloses(symbol: string, from: string, to: string): Promise<RawClose[]> {
    const key = `${symbol}:${from}:${to}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.rows;
    const rows: RawClose[] = [];
    for (let page = 1; page <= 20; page++) {
      const url = `${BASE}?sort=date&q=code:${encodeURIComponent(symbol)}~date:gte:${from}~date:lte:${to}&size=${PAGE}&page=${page}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`VNDirect ${r.status}`);
      const d = (await r.json()) as {
        data?: { date: string; close: number; adClose: number }[];
        totalPages?: number;
      };
      for (const x of d.data ?? []) {
        // Giá trả về theo nghìn đồng
        if (x.close > 0) rows.push({ date: x.date, close: x.close * 1000, adjClose: x.adClose * 1000 });
      }
      if (!d.totalPages || page >= d.totalPages) break;
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(key, { at: Date.now(), rows });
    return rows;
  }
}
