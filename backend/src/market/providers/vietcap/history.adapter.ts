import { Injectable, Logger } from '@nestjs/common';
import { VietcapHttpClient } from './vietcap-http.client';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Nến ngày của cổ phiếu và chỉ số: Vietcap là nguồn chính, DNSE dự phòng */
@Injectable()
export class VietcapHistoryAdapter {
  private log = new Logger(VietcapHistoryAdapter.name);

  constructor(private readonly http: VietcapHttpClient) {}

  /** Nến ngày, mới nhất ở cuối. Dùng được cho cả mã cổ phiếu lẫn VNINDEX */
  async history(symbol: string, days: number): Promise<Candle[]> {
    return this.http.cached(`hist:${symbol}:${days}`, 10 * 60_000, async () => {
      try {
        return await this.fromVietcap(symbol, days);
      } catch (e) {
        this.log.warn(`Lịch sử giá Vietcap lỗi (${(e as Error).message}), dùng DNSE`);
        return this.fromDnse(symbol, days);
      }
    });
  }

  /** Nguồn dự phòng: chart API của DNSE (giá cổ phiếu tính bằng nghìn đồng) */
  private async fromDnse(symbol: string, days: number): Promise<Candle[]> {
    const isIndex = /INDEX$|^VN30$|^HNX30$/i.test(symbol);
    const now = Math.floor(Date.now() / 1000);
    // days là số phiên; quy ra ngày lịch, cộng dư cho cuối tuần + lễ
    const from = now - Math.ceil(days * 1.5) * 86400;
    const d = await this.http.get<{ t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }>(
      'dnse',
      `/ohlcs/${isIndex ? 'index' : 'stock'}?from=${from}&to=${now}&symbol=${symbol}&resolution=1D`,
    );
    const k = isIndex ? 1 : 1000;
    return d.t
      .map((t, i) => ({
        time: t,
        open: d.o[i] * k,
        high: d.h[i] * k,
        low: d.l[i] * k,
        close: d.c[i] * k,
        volume: d.v[i],
      }))
      .slice(-days);
  }

  private async fromVietcap(symbol: string, days: number): Promise<Candle[]> {
    const rows = await this.http.post<
      { o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; t: string[] }[]
    >('trading', '/chart/OHLCChart/gap-chart', {
      timeFrame: 'ONE_DAY',
      symbols: [symbol],
      to: Math.floor(Date.now() / 1000) + 86400,
      countBack: days,
    });
    const r = rows[0];
    if (!r?.t?.length) throw new Error(`không có dữ liệu ${symbol}`);
    return r.t.map((t, i) => ({
      time: Number(t),
      open: r.o[i],
      high: r.h[i],
      low: r.l[i],
      close: r.c[i],
      volume: r.v[i],
    }));
  }
}
