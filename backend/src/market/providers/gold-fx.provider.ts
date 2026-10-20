import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { FxRate, GoldQuote, UsdtRate } from '../types';

/** 1 lượng = 37.5g; 1 troy oz = 31.1035g */
export const OZ_PER_LUONG = 37.5 / 31.1034768;

const GOLD_NAMES: Record<string, string> = {
  SJL1L10: 'SJC miếng (SJC)',
  SJ9999: 'SJC nhẫn 9999',
  DOHNL: 'DOJI Hà Nội (miếng SJC)',
  DOHCML: 'DOJI HCM (miếng SJC)',
  DOJINHTV: 'DOJI nhẫn Hưng Thịnh Vượng',
  BTSJC: 'Bảo Tín Minh Châu - SJC',
  BT9999NTT: 'Bảo Tín Minh Châu - nhẫn tròn 9999',
  PQHNVM: 'PNJ Hà Nội (miếng)',
  PQHN24NTT: 'PNJ nhẫn 24K',
  VIETTINMSJC: 'Vietinbank Gold - SJC',
  VNGSJC: 'VN Gold - SJC',
  XAUUSD: 'Vàng thế giới (USD/oz)',
};

@Injectable()
export class GoldFxProvider {
  private log = new Logger(GoldFxProvider.name);

  /**
   * vang.today tổng hợp giá SJC / DOJI / PNJ / BTMC; BTMC trực tiếp làm dự phòng.
   * Khi vang.today lỗi mà đã có dữ liệu trước đó thì giữ bản cũ — đổi nguồn sẽ làm
   * các mã vàng người dùng đang nắm giữ không còn khớp giá.
   */
  async gold(previous: GoldQuote[] = []): Promise<GoldQuote[]> {
    try {
      return await this.fromVangToday();
    } catch (e) {
      if (previous.some((g) => g.source === 'vang.today')) {
        this.log.warn(`vang.today lỗi (${(e as Error).message}), giữ giá lần cập nhật trước`);
        return previous;
      }
      this.log.warn(`vang.today lỗi (${(e as Error).message}), dùng BTMC`);
      return this.fromBtmc();
    }
  }

  private async fromVangToday(): Promise<GoldQuote[]> {
    const r = await fetch('https://www.vang.today/api/prices', {
      signal: AbortSignal.timeout(15000),
    });
    const d = (await r.json()) as {
      success: boolean;
      timestamp: number;
      prices: Record<
        string,
        { name: string; buy: number; sell: number; change_buy: number; change_sell: number; currency: 'VND' | 'USD' }
      >;
    };
    if (!d.success) throw new Error('success=false');
    const updatedAt = new Date(d.timestamp * 1000).toISOString();
    return Object.entries(d.prices).map(([code, p]) => ({
      code,
      name: GOLD_NAMES[code] ?? p.name,
      buy: p.buy,
      sell: p.sell,
      changeBuy: p.change_buy,
      changeSell: p.change_sell,
      currency: p.currency,
      source: 'vang.today',
      updatedAt,
    }));
  }

  private async fromBtmc(): Promise<GoldQuote[]> {
    const r = await fetch('http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v', {
      signal: AbortSignal.timeout(15000),
    });
    const d = (await r.json()) as { DataList: { Data: Record<string, string>[] } };
    const seen = new Set<string>();
    const out: GoldQuote[] = [];
    for (const row of d.DataList.Data) {
      const i = row['@row'];
      const name = row[`@n_${i}`];
      if (seen.has(name) || /BẠC/i.test(name)) continue;
      seen.add(name);
      const buy = Number(row[`@pb_${i}`]) * 10;
      const sell = Number(row[`@ps_${i}`]) * 10;
      if (!sell) continue;
      // Giữ cùng mã với vang.today cho 2 sản phẩm phổ biến để danh mục vẫn định giá được
      const code = /VÀNG MIẾNG SJC/i.test(name) ? 'BTSJC' : /NHẪN TRÒN TRƠN/i.test(name) ? 'BT9999NTT' : `BTMC:${name}`;
      out.push({
        code,
        name: GOLD_NAMES[code] ?? name,
        buy,
        sell,
        changeBuy: 0,
        changeSell: 0,
        currency: 'VND',
        source: 'btmc.vn',
        updatedAt: new Date().toISOString(),
      });
    }
    return out;
  }

  async fx(): Promise<FxRate[]> {
    const r = await fetch('https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    const xml = await r.text();
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml) as {
      ExrateList: { DateTime: string; Exrate: Record<string, string>[] };
    };
    const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0;
    return parsed.ExrateList.Exrate.filter((e) => ['USD', 'EUR', 'JPY', 'CNY', 'SGD'].includes(e.CurrencyCode)).map(
      (e) => ({
        code: e.CurrencyCode,
        buy: num(e.Buy),
        transfer: num(e.Transfer),
        sell: num(e.Sell),
        updatedAt: parsed.ExrateList.DateTime,
      }),
    );
  }

  /**
   * USDT/VND từ Binance P2P: lấy trung vị 5 quảng cáo tốt nhất mỗi chiều.
   * tradeType BUY = quảng cáo bán USDT (người dùng mua), SELL = quảng cáo mua USDT (người dùng bán).
   */
  async usdtVnd(): Promise<UsdtRate> {
    const side = async (tradeType: 'BUY' | 'SELL') => {
      const r = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({
          fiat: 'VND',
          asset: 'USDT',
          tradeType,
          page: 1,
          rows: 10,
          countries: [],
          payTypes: [],
          proMerchantAds: false,
          shieldMerchantAds: false,
          publisherType: null,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const d = (await r.json()) as { data?: { adv: { price: string } }[] };
      const prices = (d.data ?? [])
        .map((a) => Number(a.adv.price))
        .filter((x) => x > 0)
        .slice(0, 5);
      if (!prices.length) throw new Error(`Binance P2P không có quảng cáo ${tradeType}`);
      return median(prices);
    };
    const [buy, sell] = await Promise.all([side('BUY'), side('SELL')]);
    return {
      buy,
      sell,
      mid: Math.round((buy + sell) / 2),
      source: 'Binance P2P',
      updatedAt: new Date().toISOString(),
    };
  }
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
