import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { IndexQuote, StockQuote } from '../types';

const SYMBOLS_FILE = join(process.cwd(), 'data', 'symbols.json');

const TRADING = 'https://trading.vietcap.com.vn/api';
const IQ = 'https://iq.vietcap.com.vn/api/iq-insight-service/v1';
const HEADERS = {
  Origin: 'https://trading.vietcap.com.vn',
  Referer: 'https://trading.vietcap.com.vn/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
};

export interface SymbolInfo {
  symbol: string;
  name: string;
  board: string;
  type: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CacheEntry<T> {
  at: number;
  value: T;
}

/**
 * Nguồn dữ liệu chứng khoán VN từ Vietcap (API công khai mà web bảng giá của họ dùng).
 * Không phải API chính thức cho bên thứ ba — đủ cho giai đoạn thử nghiệm;
 * khi ra thị trường nên chuyển sang nguồn có hợp đồng (SSI FastConnect, FiinTrade...).
 */
@Injectable()
export class VietcapProvider {
  private log = new Logger(VietcapProvider.name);
  private cache = new Map<string, CacheEntry<unknown>>();
  private symbols: Map<string, SymbolInfo> | null = null;

  private async get<T>(url: string): Promise<T> {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Vietcap ${r.status} ${url}`);
    return (await r.json()) as T;
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Vietcap ${r.status} ${url}`);
    return (await r.json()) as T;
  }

  private async cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as CacheEntry<T> | undefined;
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /**
   * Danh sách toàn bộ mã niêm yết. Lưu xuống đĩa mỗi lần tải được, để khi API lỗi
   * (đã gặp: endpoint GET của Vietcap trả 500 cả buổi) vẫn tìm kiếm được.
   */
  async allSymbols(): Promise<Map<string, SymbolInfo>> {
    if (this.symbols) return this.symbols;
    try {
      const rows = await this.get<
        { symbol: string; organName: string; board: string; type: string }[]
      >(`${TRADING}/price/symbols/getAll`);
      const list = rows
        .filter((r) => ['HSX', 'HNX', 'UPCOM'].includes(r.board))
        .map((r) => ({ symbol: r.symbol, name: r.organName, board: r.board, type: r.type }));
      await mkdir(dirname(SYMBOLS_FILE), { recursive: true });
      await writeFile(SYMBOLS_FILE, JSON.stringify(list));
      this.symbols = new Map(list.map((s) => [s.symbol, s]));
      this.log.log(`Đã tải ${this.symbols.size} mã chứng khoán`);
    } catch (e) {
      const disk = await readFile(SYMBOLS_FILE, 'utf8').catch(() => null);
      if (!disk) throw e;
      const list = JSON.parse(disk) as SymbolInfo[];
      this.symbols = new Map(list.map((s) => [s.symbol, s]));
      this.log.warn(`API danh sách mã lỗi, dùng bản lưu trên đĩa (${list.length} mã)`);
    }
    return this.symbols;
  }

  /** Kiểm tra một mã có tồn tại không mà không cần danh sách đầy đủ (dùng API bảng giá) */
  async lookup(symbol: string): Promise<SymbolInfo | null> {
    const all = await this.allSymbols().catch(() => null);
    if (all) return all.get(symbol) ?? null;
    const [q] = await this.board([symbol]).catch(() => []);
    return q?.symbol === symbol ? { symbol, name: q.name, board: q.board, type: 'STOCK' } : null;
  }

  async group(group: string): Promise<string[]> {
    return this.cached(`group:${group}`, 6 * 3600_000, async () => {
      const rows = await this.get<{ symbol: string }[]>(
        `${TRADING}/price/symbols/getByGroup?group=${group}`,
      );
      return rows.map((r) => r.symbol);
    });
  }

  async board(symbols: string[]): Promise<StockQuote[]> {
    if (!symbols.length) return [];
    const out: StockQuote[] = [];
    // API chịu được vài chục mã một lần; chia lô cho chắc
    for (let i = 0; i < symbols.length; i += 50) {
      const rows = await this.post<VcBoardRow[]>(`${TRADING}/price/symbols/getList`, {
        symbols: symbols.slice(i, i + 50),
      });
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
    const rows = await this.post<VcIndexRow[]>(`${TRADING}/price/marketIndex/getList`, {
      symbols: ['VNINDEX', 'VN30', 'HNXIndex', 'HNXUpcomIndex'],
    });
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

  /** Nến ngày, mới nhất ở cuối. Dùng được cho cả mã cổ phiếu lẫn VNINDEX */
  async history(symbol: string, days: number): Promise<Candle[]> {
    return this.cached(`hist:${symbol}:${days}`, 10 * 60_000, async () => {
      try {
        return await this.historyVietcap(symbol, days);
      } catch (e) {
        this.log.warn(`Lịch sử giá Vietcap lỗi (${(e as Error).message}), dùng DNSE`);
        return this.historyDnse(symbol, days);
      }
    });
  }

  /** Nguồn dự phòng: chart API của DNSE (giá cổ phiếu tính bằng nghìn đồng) */
  private async historyDnse(symbol: string, days: number): Promise<Candle[]> {
    const isIndex = /INDEX$|^VN30$|^HNX30$/i.test(symbol);
    const now = Math.floor(Date.now() / 1000);
    // days là số phiên; quy ra ngày lịch, cộng dư cho cuối tuần + lễ
    const from = now - Math.ceil(days * 1.5) * 86400;
    const r = await fetch(
      `https://services.entrade.com.vn/chart-api/v2/ohlcs/${isIndex ? 'index' : 'stock'}?from=${from}&to=${now}&symbol=${symbol}&resolution=1D`,
      { headers: { 'User-Agent': HEADERS['User-Agent'] }, signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) throw new Error(`DNSE ${r.status}`);
    const d = (await r.json()) as { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
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

  private async historyVietcap(symbol: string, days: number): Promise<Candle[]> {
    {
      const rows = await this.post<
        { o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; t: string[] }[]
      >(`${TRADING}/chart/OHLCChart/gap-chart`, {
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

  async company(symbol: string) {
    return this.cached(`company:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.get<{ data: Record<string, unknown> | null }>(
        `${IQ}/company/${symbol}`,
      );
      const d = res.data;
      if (!d) return null;
      return {
        ticker: d.ticker,
        name: d.viOrganName,
        sector: d.sectorVn,
        isBank: d.isBank,
        marketCapBn: Math.round(Number(d.marketCap) / 1e9),
        sharesOutstanding: d.numberOfSharesMktCap,
        high52w: d.highestPrice1Year,
        low52w: d.lowestPrice1Year,
        avgMatchValue1mBn: Math.round(Number(d.averageMatchValue1Month) / 1e9),
        foreignOwnershipPct: pct(d.foreignerPercentage),
        foreignRoomMaxPct: pct(d.maximumForeignPercentage),
        stateOwnershipPct: pct(d.statePercentage),
        freeFloatPct: pct(d.freeFloatPercentage),
        listingDate: d.listingDate,
        analystView: d.rating
          ? {
              source: 'Vietcap Research',
              rating: d.rating,
              ratingAsOf: d.ratingAsOf,
              targetPrice: d.targetPrice,
              upsidePct: pct(d.upsideToTargetPercent),
              previous: d.prevInsight,
            }
          : null,
        profile: stripHtml(String(d.profile ?? '')).slice(0, 1500),
      };
    });
  }

  /** Chỉ số tài chính TTM theo quý, 8 quý gần nhất */
  async ratios(symbol: string) {
    return this.cached(`ratios:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.get<{ data: Record<string, number | string | null>[] | null }>(
        `${IQ}/company/${symbol}/statistics-financial`,
      );
      // quarter = 5 là số liệu cả năm, trùng với quý 4 — bỏ đi
      const rows = (res.data ?? [])
        .filter((r) => Number(r.quarter) >= 1 && Number(r.quarter) <= 4)
        .sort(
          (a, b) =>
            Number(a.yearReport) - Number(b.yearReport) ||
            Number(a.quarter) - Number(b.quarter),
        )
        .slice(-8);
      const keep = [
        'pe', 'pb', 'ps', 'evToEbitda', 'roe', 'roa', 'roic', 'grossMargin',
        'afterTaxProfitMargin', 'debtToEquity', 'currentRatio', 'quickRatio',
        'dividendYield', 'marketCap', 'netInterestMargin', 'npl', 'casaRatio',
        'ldrLoanDepositRatio', 'costToIncome', 'car', 'loansGrowth', 'depositGrowth',
      ];
      return rows.map((r) => {
        const o: Record<string, number | string> = { period: `Q${r.quarter}/${r.yearReport}` };
        for (const k of keep) {
          const v = r[k];
          if (v === null || v === undefined || v === 0) continue;
          o[k] = k === 'marketCap' ? Math.round(Number(v) / 1e9) : round(Number(v), 4);
        }
        return o;
      });
    });
  }

  /** Báo cáo KQKD: các dòng cấp 1, 5 năm + 6 quý gần nhất, đơn vị tỷ VND */
  async incomeStatement(symbol: string) {
    return this.cached(`is:${symbol}`, 6 * 3600_000, async () => {
      const [meta, data] = await Promise.all([
        this.get<{ data: { INCOME_STATEMENT: { field: string; level: number; titleVi: string }[] } }>(
          `${IQ}/company/${symbol}/financial-statement/metrics`,
        ),
        this.get<{
          data: { years: Record<string, number>[]; quarters: Record<string, number>[] };
        }>(`${IQ}/company/${symbol}/financial-statement?section=INCOME_STATEMENT`),
      ]);
      const lines = meta.data.INCOME_STATEMENT.filter(
        (m) => m.level === 1 || /Tổng lợi nhuận|Tổng thu nhập hoạt động|Trích lập dự phòng/.test(m.titleVi),
      );
      const pick = (row: Record<string, number>, label: string) => {
        const o: Record<string, number | string> = { period: label };
        for (const m of lines) {
          const v = row[m.field];
          if (typeof v !== 'number') continue;
          o[m.titleVi] = /cổ phiếu \(VND\)/.test(m.titleVi) ? v : round(v / 1e9, 1);
        }
        return o;
      };
      const years = [...data.data.years]
        .sort((a, b) => a.yearReport - b.yearReport)
        .slice(-5)
        .map((r) => pick(r, `${r.yearReport}`));
      const quarters = [...data.data.quarters]
        .filter((r) => r.lengthReport >= 1 && r.lengthReport <= 4)
        .sort((a, b) => a.yearReport - b.yearReport || a.lengthReport - b.lengthReport)
        .slice(-6)
        .map((r) => pick(r, `Q${r.lengthReport}/${r.yearReport}`));
      // Bỏ các dòng toàn 0 (vd. EPS pha loãng không được công bố)
      const empty = lines
        .map((m) => m.titleVi)
        .filter((k) => [...years, ...quarters].every((r) => !r[k]));
      for (const r of [...years, ...quarters]) for (const k of empty) delete r[k];
      return { unit: 'tỷ VND (EPS: VND)', years, quarters };
    });
  }

  async safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      this.log.warn(`${label}: ${(e as Error).message}`);
      return fallback;
    }
  }
}

function pct(v: unknown) {
  return typeof v === 'number' ? round(v * 100, 2) : null;
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function stripHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const HTML_ENTITIES: Record<string, string> = {
  '&ocirc;': 'ô', '&oacute;': 'ó', '&ograve;': 'ò', '&otilde;': 'õ', '&aacute;': 'á',
  '&agrave;': 'à', '&atilde;': 'ã', '&acirc;': 'â', '&eacute;': 'é', '&egrave;': 'è',
  '&ecirc;': 'ê', '&iacute;': 'í', '&igrave;': 'ì', '&uacute;': 'ú', '&ugrave;': 'ù',
  '&yacute;': 'ý', '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>',
  '&Ocirc;': 'Ô', '&Aacute;': 'Á', '&Eacute;': 'É', '&Uacute;': 'Ú', '&Ecirc;': 'Ê',
};

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
