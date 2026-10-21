import { Injectable } from '@nestjs/common';
import type { IndexQuote, StockQuote } from '../../types';
import { VietcapHttpClient } from './vietcap-http.client';
import type { RequestOptions } from './vietcap-http.client';

/** Poll 3 giây: không thử lại (nhịp poll kế tiếp chính là lần thử lại) và chờ ngắn để không chặn nhịp đó */
const POLL: RequestOptions = { attempts: 1, timeoutMs: 5_000 };

/**
 * Bảng giá thời gian thực từ Vietcap (API công khai mà web bảng giá của họ dùng).
 * Không phải API chính thức cho bên thứ ba — đủ cho giai đoạn thử nghiệm;
 * khi ra thị trường nên chuyển sang nguồn có hợp đồng (SSI FastConnect, FiinTrade...).
 */
@Injectable()
export class VietcapQuotesAdapter {
  constructor(private readonly http: VietcapHttpClient) {}

  async board(symbols: string[]): Promise<StockQuote[]> {
    if (!symbols.length) return [];
    const out: StockQuote[] = [];
    // API chịu được vài chục mã một lần; chia lô cho chắc
    for (let i = 0; i < symbols.length; i += 50) {
      const rows = await this.http.post<VcBoardRow[]>(
        'trading',
        '/price/symbols/getList',
        { symbols: symbols.slice(i, i + 50) },
        POLL,
      );
      for (const r of rows) {
        const li = r.listingInfo ?? {};
        const mp = r.matchPrice ?? {};
        const ref = li.refPrice ?? 0;
        const price = mp.matchPrice || ref;
        out.push({
          symbol: li.symbol,
          name: li.organName ?? li.symbol,
          board: li.board,
          price,
          ref,
          ceiling: li.ceiling ?? 0,
          floor: li.floor ?? 0,
          open: mp.openPrice ?? 0,
          high: mp.highest ?? 0,
          low: mp.lowest ?? 0,
          change: price - ref,
          changePct: ref ? ((price - ref) / ref) * 100 : 0,
          volume: mp.accumulatedVolume ?? 0,
          valueBn: (mp.accumulatedValue ?? 0) / 1000,
          foreignBuyVol: mp.foreignBuyVolume ?? 0,
          foreignSellVol: mp.foreignSellVolume ?? 0,
          session: mp.session ?? '',
          time: mp.time ?? li.tradingDate ?? '',
        });
      }
    }
    return out;
  }

  async indices(): Promise<IndexQuote[]> {
    const rows = await this.http.post<VcIndexRow[]>(
      'trading',
      '/price/marketIndex/getList',
      { symbols: ['VNINDEX', 'VN30', 'HNXIndex', 'HNXUpcomIndex'] },
      POLL,
    );
    return rows.map((r) => ({
      symbol: r.symbol,
      price: r.price,
      change: r.change,
      changePct: r.changePercent,
      advances: r.totalStockIncrease,
      declines: r.totalStockDecline,
      unchanged: r.totalStockNoChange,
      valueBn: r.totalValue / 1000,
      time: r.time,
    }));
  }
}

interface VcBoardRow {
  listingInfo: {
    symbol: string;
    organName?: string;
    board: string;
    refPrice?: number;
    ceiling?: number;
    floor?: number;
    tradingDate?: string;
  };
  matchPrice?: {
    matchPrice?: number;
    openPrice?: number;
    highest?: number;
    lowest?: number;
    accumulatedVolume?: number;
    accumulatedValue?: number;
    foreignBuyVolume?: number;
    foreignSellVolume?: number;
    session?: string;
    time?: string;
  };
}

interface VcIndexRow {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  totalStockIncrease: number;
  totalStockDecline: number;
  totalStockNoChange: number;
  totalValue: number;
  time: string;
}
