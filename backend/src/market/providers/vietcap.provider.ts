import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { cashQuality, netDebt, StatRow, StatementRow } from '../fundamentals';
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

export interface CorporateEvent {
  symbol: string;
  kind: 'stock' | 'cash';
  title: string;
  /** Ngày giao dịch không hưởng quyền (YYYY-MM-DD) */
  exDate: string;
  recordDate: string | null;
  payoutDate: string | null;
  /** stock: số cổ phiếu nhận thêm cho mỗi cổ phiếu đang giữ (0.1 = 10%) */
  ratio: number | null;
  /** cash: VND / cổ phiếu, trước thuế */
  valuePerShare: number | null;
}

/**
 * Sự kiện quyền toàn thị trường, nguyên văn từ Vietcap (đã kiểm tra bằng gọi thật 21/10/2026, 4 tháng, 143 sự kiện DIV/ISS/AGME/EGME):
 *  - ngày dạng "YYYY-MM-DDT00:00:00" (lịch VN); phân trang size<=500, totalElements đủ cho cả cửa sổ 120 ngày.
 *  - Sự kiện mới công bố có thể CHƯA có exrightDate/recordDate (chỉ displayDate1 = ngày công bố): không đủ để xếp lịch.
 *  - DIV: exrightDate = GDKHQ, recordDate = chốt danh sách, payoutDate = thanh toán, valuePerShare = VND/cp (exerciseRatio = %/mệnh giá).
 *  - ISS: eventTitleEn "Rights issue" = quyền mua (KHÔNG có trường giá phát hành), "Bonus Issue"/"Stock dividend" = cổ phiếu thưởng /
 *    cổ tức bằng CP; còn lại (ESOP, Private Placements, Convertible Bonds) không phải quyền của cổ đông hiện hữu. exerciseRatio = tỷ lệ (0.5 = 50%).
 *  - AGME/EGME: exrightDate = GDKHQ để được dự họp, recordDate = ngày chốt, issueDate = ngày họp (không phải lúc nào cũng có;
 *    displayDate1 là ngày họp nếu có issueDate, còn không thì bằng exrightDate nên không dùng làm ngày họp).
 */
export interface VcMarketEvent {
  id: string;
  ticker: string;
  organNameVi?: string;
  eventCode: string;
  eventTitleVi?: string;
  eventTitleEn?: string;
  publicDate?: string;
  issueDate?: string;
  recordDate?: string;
  exrightDate?: string;
  payoutDate?: string;
  exerciseRatio?: number;
  valuePerShare?: number;
}

export interface MarketEvents {
  events: VcMarketEvent[];
  fetchedAt: string;
}

interface VcEvent {
  eventCode?: string;
  eventNameVi?: string;
  eventTitleVi?: string;
  eventTitleEn?: string;
  exrightDate?: string;
  recordDate?: string;
  payoutDate?: string;
  exerciseRatio?: number;
  valuePerShare?: number;
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
      const rows = await this.get<{ symbol: string; organName: string; board: string; type: string }[]>(
        `${TRADING}/price/symbols/getAll`,
      );
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
      const rows = await this.get<{ symbol: string }[]>(`${TRADING}/price/symbols/getByGroup?group=${group}`);
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
      const rows = await this.post<{ o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; t: string[] }[]>(
        `${TRADING}/chart/OHLCChart/gap-chart`,
        {
          timeFrame: 'ONE_DAY',
          symbols: [symbol],
          to: Math.floor(Date.now() / 1000) + 86400,
          countBack: days,
        },
      );
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
      const res = await this.get<{ data: Record<string, unknown> | null }>(`${IQ}/company/${symbol}`);
      const d = res.data;
      if (!d) return null;
      return {
        ticker: d.ticker,
        name: d.viOrganName,
        sector: d.sectorVn,
        isBank: d.isBank,
        /** NH ngân hàng, CK chứng khoán, BH bảo hiểm, CT doanh nghiệp thường */
        companyType: d.comTypeCode as string | undefined,
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
        profile: stripHtml(typeof d.profile === 'string' ? d.profile : '').slice(0, 1500),
      };
    });
  }

  /** Chỉ số tài chính TTM theo quý, 8 quý gần nhất */
  async ratios(symbol: string) {
    return this.cached(`ratios:${symbol}`, 6 * 3600_000, async () => {
      // quarter = 5 là số liệu cả năm, trùng với quý 4 — bỏ đi
      const rows = (await this.statsRaw(symbol))
        .filter((r) => Number(r.quarter) >= 1 && Number(r.quarter) <= 4)
        .sort((a, b) => Number(a.yearReport) - Number(b.yearReport) || Number(a.quarter) - Number(b.quarter))
        .slice(-8);
      const keep = [
        'pe',
        'pb',
        'ps',
        'evToEbitda',
        'roe',
        'roa',
        'roic',
        'grossMargin',
        'afterTaxProfitMargin',
        'debtToEquity',
        'currentRatio',
        'quickRatio',
        'dividendYield',
        'marketCap',
        'netInterestMargin',
        'npl',
        'casaRatio',
        'ldrLoanDepositRatio',
        'costToIncome',
        'car',
        'loansGrowth',
        'depositGrowth',
      ];
      return rows.map((r) => {
        const o: Record<string, number | string> = { period: `Q${r.quarter}/${r.yearReport}` };
        for (const k of keep) {
          const v = r[k];
          if (v === null || v === undefined || v === 0) continue;
          // Vietcap gọi là debtToEquity nhưng thực chất là tổng nợ phải trả / vốn chủ — đổi tên cho khỏi nhầm
          // với "nợ vay / vốn chủ" của bảng cân đối kế toán
          const key = k === 'debtToEquity' ? 'liabilitiesToEquity' : k;
          o[key] = k === 'marketCap' ? Math.round(Number(v) / 1e9) : round(Number(v), 4);
        }
        return o;
      });
    });
  }

  /** Báo cáo KQKD: các dòng cấp 1, 5 năm + 6 quý gần nhất, đơn vị tỷ VND */
  async incomeStatement(symbol: string) {
    return this.cached(`is:${symbol}`, 6 * 3600_000, async () => {
      const [meta, data] = await Promise.all([this.metrics(symbol), this.statementRows(symbol, 'INCOME_STATEMENT')]);
      const lines = meta.INCOME_STATEMENT.filter(
        (m): m is VcMetric & { field: string } =>
          !!m.field && (m.level === 1 || /Tổng lợi nhuận|Tổng thu nhập hoạt động|Trích lập dự phòng/.test(m.titleVi)),
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
      const years = data.years.slice(-5).map((r) => pick(r, `${r.yearReport}`));
      const quarters = data.quarters.slice(-6).map((r) => pick(r, `Q${r.lengthReport}/${r.yearReport}`));
      // Bỏ các dòng toàn 0 (vd. EPS pha loãng không được công bố)
      const empty = lines.map((m) => m.titleVi).filter((k) => [...years, ...quarters].every((r) => !r[k]));
      for (const r of [...years, ...quarters]) for (const k of empty) delete r[k];
      return { unit: 'tỷ VND (EPS: VND)', years, quarters };
    });
  }

  /** Báo cáo KQKD theo năm (tăng dần), nguyên mã trường và đơn vị VND — cho phép tính so sánh ở nơi khác */
  async incomeYears(symbol: string): Promise<Record<string, number>[]> {
    return (await this.statementRows(symbol, 'INCOME_STATEMENT')).years;
  }

  /** Bảng P/E, P/B… TTM theo từng quý (từ 2018) — dùng chung cho ratios() và dải định giá lịch sử */
  async statsRaw(symbol: string): Promise<(StatRow & Record<string, number | string | null>)[]> {
    return this.cached(`stats:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.get<{ data: (StatRow & Record<string, number | string | null>)[] | null }>(
        `${IQ}/company/${symbol}/statistics-financial`,
      );
      return res.data ?? [];
    });
  }

  private metrics(symbol: string) {
    return this.cached(`metrics:${symbol}`, 24 * 3600_000, async () => {
      const res = await this.get<{ data: Record<string, VcMetric[]> }>(
        `${IQ}/company/${symbol}/financial-statement/metrics`,
      );
      return res.data;
    });
  }

  /** Số liệu một báo cáo tài chính: năm tăng dần, quý (riêng từng quý, không cộng dồn) tăng dần */
  private statementRows(symbol: string, section: string) {
    return this.cached(`fs:${section}:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.get<{ data: { years: Record<string, number>[]; quarters: Record<string, number>[] } }>(
        `${IQ}/company/${symbol}/financial-statement?section=${section}`,
      );
      const years = [...(res.data?.years ?? [])].sort((a, b) => a.yearReport - b.yearReport);
      const quarters = [...(res.data?.quarters ?? [])]
        .filter((r) => r.lengthReport >= 1 && r.lengthReport <= 4)
        .sort((a, b) => a.yearReport - b.yearReport || a.lengthReport - b.lengthReport);
      return { years, quarters };
    });
  }

  /**
   * Chọn các dòng quan trọng của một báo cáo theo mã trường. Dạng báo cáo khác (công ty chứng khoán,
   * bảo hiểm) không có đủ các trường này thì lấy các dòng cấp 1.
   */
  private async keyLines(symbol: string, section: 'BALANCE_SHEET' | 'CASH_FLOW', wanted: [string, string?][]) {
    const [meta, data] = await Promise.all([this.metrics(symbol), this.statementRows(symbol, section)]);
    const all = meta[section] ?? [];
    const byField = new Map(all.filter((m) => m.field).map((m) => [m.field as string, m]));
    let lines = wanted
      .filter(([f]) => byField.has(f))
      .map(([f, label]) => ({ field: f, label: label ?? byField.get(f)!.titleVi }));
    const standard = lines.length >= 5;
    if (!standard)
      lines = all.filter((m) => m.level === 1 && m.field).map((m) => ({ field: m.field as string, label: m.titleVi }));
    const pick = (row: Record<string, number>, period: string) => {
      const o: StatementRow = { period };
      for (const l of lines) {
        const v = row[l.field];
        // Mẫu báo cáo riêng có nhiều dòng không dùng (toàn 0) — bỏ cho gọn
        if (typeof v === 'number' && (standard || v !== 0)) o[l.field] = round(v / 1e9, 1);
      }
      return o;
    };
    return {
      standard,
      lines,
      years: data.years.slice(-5).map((r) => pick(r, `${r.yearReport}`)),
      quarters: data.quarters.map((r) => pick(r, `Q${r.lengthReport}/${r.yearReport}`)),
    };
  }

  /** Đổi mã trường sang tên dòng tiếng Việt cho dễ đọc */
  private labelled(rows: StatementRow[], lines: { field: string; label: string }[]) {
    return rows.map((r) => {
      const o: StatementRow = {};
      for (const [k, v] of Object.entries(r)) o[lines.find((l) => l.field === k)?.label ?? k] = v;
      return o;
    });
  }

  /** Loại doanh nghiệp quyết định cách đọc báo cáo tài chính */
  async kind(symbol: string): Promise<'bank' | 'securities' | 'insurance' | 'corporate'> {
    const [meta, company] = await Promise.all([
      this.metrics(symbol),
      this.safe('company', () => this.company(symbol), null),
    ]);
    if (company?.isBank || (meta.BALANCE_SHEET ?? []).some((m) => m.field === 'bsb103')) return 'bank';
    if (company?.companyType === 'CK') return 'securities';
    if (company?.companyType === 'BH') return 'insurance';
    return 'corporate';
  }

  /** Bảng cân đối kế toán: 5 năm + 4 quý gần nhất (số dư cuối kỳ), tỷ VND, kèm nợ vay ròng */
  async balanceSheet(symbol: string) {
    return this.cached(`bs:${symbol}`, 6 * 3600_000, async () => {
      const kind = await this.kind(symbol);
      // Chứng khoán / bảo hiểm có mẫu báo cáo riêng: lấy các dòng cấp 1, không tính chỉ tiêu nợ vay ròng
      const k = await this.keyLines(
        symbol,
        'BALANCE_SHEET',
        kind === 'bank' ? BANK_BS : kind === 'corporate' ? CORP_BS : [],
      );
      const derive = (r: StatementRow): StatementRow => {
        if (kind !== 'corporate' || !k.standard) return r;
        const d = netDebt(r, { stDebt: 'bsa56', ltDebt: 'bsa71', cash: 'bsa2', stInv: 'bsa5' });
        const equity = typeof r.bsa78 === 'number' ? r.bsa78 : 0;
        return {
          ...r,
          'Tổng nợ vay (ngắn + dài hạn)': d.totalDebt,
          'Nợ vay ròng (nợ vay − tiền − đầu tư ngắn hạn; âm = tiền nhiều hơn nợ vay)': d.netDebt,
          'Nợ vay / Vốn chủ sở hữu (lần)': equity > 0 ? round(d.totalDebt / equity, 2) : '',
        };
      };
      return {
        unit: 'tỷ VND, số dư cuối kỳ',
        type: KIND_LABEL[kind],
        note: KIND_NOTE[kind],
        years: this.labelled(k.years.map(derive), k.lines),
        quarters: this.labelled(k.quarters.slice(-4).map(derive), k.lines),
      };
    });
  }

  /** Lưu chuyển tiền tệ: 5 năm + 4 quý gần nhất + tổng 4 quý (TTM), tỷ VND, kèm dòng tiền tự do */
  async cashFlow(symbol: string) {
    return this.cached(`cf:${symbol}`, 6 * 3600_000, async () => {
      const kind = await this.kind(symbol);
      if (kind !== 'corporate') return { type: KIND_LABEL[kind], note: KIND_NOTE[kind] };
      const k = await this.keyLines(symbol, 'CASH_FLOW', CORP_CF);
      const derive = (r: StatementRow): StatementRow => {
        if (!k.standard) return r;
        const q = cashQuality(r, { cfo: 'cfa18', capex: 'cfa19', pretax: 'cfa1' });
        return {
          ...r,
          'Dòng tiền tự do (kinh doanh + chi mua sắm TSCĐ)': q.freeCashFlow ?? '',
          'Dòng tiền kinh doanh / Lợi nhuận trước thuế (lần)': q.cfoToPretaxProfit ?? '',
        };
      };
      const last4 = k.quarters.slice(-4);
      const consecutive =
        last4.length === 4 &&
        last4.every(
          (r, i) => i === 0 || quarterIndex(String(r.period)) - quarterIndex(String(last4[i - 1].period)) === 1,
        );
      let ttm: StatementRow | null = null;
      if (consecutive) {
        ttm = { period: `TTM (${last4[0].period} – ${last4[3].period})` };
        for (const l of k.lines) {
          if (last4.every((r) => typeof r[l.field] === 'number')) {
            ttm[l.field] = round(
              last4.reduce((s, r) => s + Number(r[l.field]), 0),
              1,
            );
          }
        }
      }
      const years = k.years.map(derive);
      const sum = (f: string) => years.reduce((s, r) => s + (typeof r[f] === 'number' ? r[f] : 0), 0);
      return {
        unit: 'tỷ VND; số âm là tiền chi ra; số quý là riêng từng quý (không cộng dồn)',
        type: k.standard ? KIND_LABEL.corporate : 'mẫu báo cáo riêng — chỉ các dòng cấp 1',
        years: this.labelled(years, k.lines),
        quarters: this.labelled(last4.map(derive), k.lines),
        ttm: ttm ? this.labelled([derive(ttm)], k.lines)[0] : null,
        cumulative:
          k.standard && years.length >= 3
            ? {
                period: `${years[0].period}–${years[years.length - 1].period}`,
                'Tổng dòng tiền kinh doanh': round(sum('cfa18'), 1),
                'Tổng lợi nhuận trước thuế': round(sum('cfa1'), 1),
                'Tổng chi mua sắm TSCĐ': round(sum('cfa19'), 1),
                'Tổng cổ tức đã trả': round(sum('cfa32'), 1),
                'Dòng tiền kinh doanh / Lợi nhuận trước thuế (lần)':
                  sum('cfa1') > 0 ? round(sum('cfa18') / sum('cfa1'), 2) : '',
              }
            : null,
      };
    });
  }

  /** Cổ đông lớn còn cập nhật (bỏ các bản ghi cũ hơn 18 tháng so với kỳ công bố mới nhất) */
  async shareholders(symbol: string) {
    return this.cached(`sh:${symbol}`, 12 * 3600_000, async () => {
      const res = await this.get<{ data: VcShareholder[] | null }>(`${IQ}/company/${symbol}/shareholder`);
      const rows = (res.data ?? []).filter((r) => r.publicDate && r.percentage);
      if (!rows.length) return null;
      const latest = rows
        .map((r) => r.publicDate)
        .sort()
        .at(-1)!;
      const cutoff = new Date(latest);
      cutoff.setMonth(cutoff.getMonth() - 18);
      // Bỏ người nắm dưới 0,1% — không phải cổ đông lớn theo nghĩa thông thường
      const fresh = rows
        .filter((r) => new Date(r.publicDate) >= cutoff && r.percentage >= 0.001)
        .sort((a, b) => b.percentage - a.percentage);
      const top = fresh.slice(0, 10);
      return {
        latestDisclosure: latest,
        note: 'Theo công bố gần nhất của từng cổ đông, chỉ người nắm từ 0,1% trở lên. Bản ghi cũ hơn 18 tháng so với kỳ công bố mới nhất đã bị loại vì có thể không còn đúng.',
        top: top.map((r) => ({
          name: r.ownerName,
          type: r.ownerType === 'INDIVIDUAL' ? 'cá nhân' : 'tổ chức',
          position: r.positionName ?? undefined,
          ownershipPct: round(r.percentage * 100, 2),
          asOf: r.publicDate,
        })),
        top10TotalPct: round(top.reduce((s, r) => s + r.percentage, 0) * 100, 2),
        excludedStale: rows.filter((r) => new Date(r.publicDate) < cutoff).length,
      };
    });
  }

  /** Giao dịch của người nội bộ và người liên quan đã hoàn tất trong 12 tháng (không tính cổ phiếu thưởng/ESOP) */
  async insiderTrades(symbol: string) {
    return this.cached(`insider:${symbol}`, 6 * 3600_000, async () => {
      const res = await this.get<{ data: { content: VcInsider[] } | null }>(
        `${IQ}/company/${symbol}/insider-transaction?page=0&size=200`,
      );
      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);
      const done = (res.data?.content ?? []).filter(
        (r) =>
          r.tradeStatusVi === 'Đã thực hiện xong' &&
          (r.actionTypeCode === 'B' || r.actionTypeCode === 'S') &&
          new Date(r.publicDate) >= since,
      );
      // Vietcap ghi khối lượng bán là số âm; một số bản ghi "đã thực hiện" không có khối lượng
      const shares = (r: VcInsider) =>
        Math.abs(r.shareAcquire || 0) || Math.abs((r.shareAfterTrade || 0) - (r.shareBeforeTrade || 0)) || null;
      const total = (code: string) =>
        done.filter((r) => r.actionTypeCode === code).reduce((s, r) => s + (shares(r) ?? 0), 0);
      const bought = total('B');
      const sold = total('S');
      return {
        period: '12 tháng gần nhất',
        note: 'Chỉ tính giao dịch đã hoàn tất (không tính đăng ký chưa thực hiện, không tính cổ phiếu thưởng/ESOP). Người liên quan = người thân hoặc tổ chức liên quan của lãnh đạo.',
        sharesBought: bought,
        sharesSold: sold,
        net: bought - sold,
        count: done.length,
        withoutVolume: done.filter((r) => shares(r) == null).length,
        recent: done.slice(0, 10).map((r) => ({
          date: r.endDate?.slice(0, 10) ?? r.publicDate.slice(0, 10),
          trader: r.traderNameVi ?? r.eventTitleVi?.split(' - ')[0] ?? 'không rõ',
          position: r.traderPositionVi ?? undefined,
          relatedTo: r.relativeNameVi && r.relativeNameVi !== r.traderNameVi ? r.relativeNameVi : undefined,
          action: r.actionTypeVi,
          shares: shares(r) ?? 'chưa ghi nhận khối lượng',
          ownershipAfterPct: r.ownershipAfterTrade ? round(r.ownershipAfterTrade * 100, 3) : undefined,
        })),
      };
    });
  }

  /**
   * Sự kiện quyền làm thay đổi số cổ phiếu / tiền của cổ đông hiện hữu: cổ phiếu thưởng, cổ tức bằng cổ phiếu,
   * chia tách (kind = stock, ratio = số cổ phiếu nhận thêm cho mỗi cổ phiếu đang giữ) và cổ tức tiền mặt
   * (kind = cash, VND / cổ phiếu). Bỏ ESOP, phát hành riêng lẻ, chuyển đổi trái phiếu, quyền mua (phải tự mua).
   */
  async corporateEvents(symbol: string): Promise<CorporateEvent[]> {
    return this.cached(`events:${symbol}`, 6 * 3600_000, async () => {
      const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
      const res = await this.get<{ data: { content?: VcEvent[] } | VcEvent[] | null }>(
        `${IQ}/events?ticker=${symbol}&fromDate=20180101&toDate=${ymd(new Date(Date.now() + 180 * 86_400_000))}&eventCode=DIV,ISS&page=0&size=200`,
      );
      const items = Array.isArray(res.data) ? res.data : (res.data?.content ?? []);
      const out: CorporateEvent[] = [];
      for (const e of items) {
        const exDate = e.exrightDate?.slice(0, 10);
        if (!exDate) continue;
        const base = {
          symbol,
          title: e.eventTitleVi ?? e.eventNameVi ?? '',
          exDate,
          recordDate: e.recordDate?.slice(0, 10) ?? null,
          payoutDate: e.payoutDate?.slice(0, 10) ?? null,
        };
        if (e.eventCode === 'DIV' && e.valuePerShare && e.valuePerShare > 0) {
          out.push({ ...base, kind: 'cash', valuePerShare: e.valuePerShare, ratio: null });
        } else if (
          e.eventCode === 'ISS' &&
          /bonus issue|stock dividend|split/i.test(e.eventTitleEn ?? '') &&
          e.exerciseRatio &&
          e.exerciseRatio > 0
        ) {
          out.push({ ...base, kind: 'stock', ratio: e.exerciseRatio, valuePerShare: null });
        }
      }
      return out.sort((a, b) => a.exDate.localeCompare(b.exDate));
    });
  }

  /**
   * Sự kiện quyền (DIV, ISS, AGME, EGME) của TOÀN thị trường trong khoảng ngày, một lần gọi (phân trang nếu cần),
   * cache 1 giờ theo khoảng ngày. Lỗi nguồn thì ném lỗi — nơi gọi quyết định hiển thị "chưa lấy được".
   */
  async marketEvents(fromDate: string, toDate: string): Promise<MarketEvents> {
    return this.cached(`market-events:${fromDate}:${toDate}`, 3600_000, async () => {
      const ymd = (d: string) => d.replace(/-/g, '');
      const events: VcMarketEvent[] = [];
      for (let page = 0; page < 10; page++) {
        const res = await this.get<{ data: { content?: VcMarketEvent[]; totalPages?: number } | null }>(
          `${IQ}/events?fromDate=${ymd(fromDate)}&toDate=${ymd(toDate)}&eventCode=DIV,ISS,AGME,EGME&page=${page}&size=500`,
        );
        if (!res.data || !Array.isArray(res.data.content)) throw new Error('Vietcap events: phản hồi không đúng dạng');
        events.push(...res.data.content);
        if (page + 1 >= (res.data.totalPages ?? 1)) break;
      }
      return { events, fetchedAt: new Date().toISOString() };
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

function quarterIndex(period: string) {
  const m = /Q(\d)\/(\d{4})/.exec(period);
  return m ? Number(m[2]) * 4 + Number(m[1]) : NaN;
}

const KIND_LABEL = {
  bank: 'ngân hàng',
  securities: 'công ty chứng khoán',
  insurance: 'công ty bảo hiểm',
  corporate: 'doanh nghiệp',
} as const;

const KIND_NOTE = {
  bank: 'Ngân hàng: dòng tiền kinh doanh chủ yếu phản ánh biến động tiền gửi và cho vay, không dùng để đánh giá chất lượng lợi nhuận như doanh nghiệp thường. Đọc theo NIM, nợ xấu, CASA, tăng trưởng tín dụng, CAR.',
  securities:
    'Công ty chứng khoán: nợ vay chủ yếu tài trợ cho vay margin và danh mục tự doanh, dòng tiền kinh doanh biến động theo dư nợ margin — không dùng nợ vay ròng hay dòng tiền/lợi nhuận như doanh nghiệp thường. Đọc theo cơ cấu doanh thu (môi giới, cho vay margin, tự doanh, ngân hàng đầu tư), dư nợ margin/vốn chủ và ROE.',
  insurance:
    'Công ty bảo hiểm: phần lớn nợ phải trả là dự phòng nghiệp vụ, tài sản chủ yếu là danh mục đầu tư — không dùng nợ vay ròng hay dòng tiền/lợi nhuận như doanh nghiệp thường. Đọc theo doanh thu phí bảo hiểm, tỷ lệ bồi thường, lợi nhuận hoạt động đầu tư và ROE.',
  corporate: undefined,
} as const;

/** Mã trường các dòng chính — doanh nghiệp thường. Nhãn bỏ trống thì dùng tên dòng của Vietcap */
const CORP_BS: [string, string?][] = [
  ['bsa2'],
  ['bsa5'],
  ['bsa8'],
  ['bsa15'],
  ['bsa1', 'Tài sản ngắn hạn'],
  ['bsa53', 'Tổng tài sản'],
  ['bsa55', 'Nợ ngắn hạn'],
  ['bsa56', 'Vay ngắn hạn'],
  ['bsa71', 'Vay dài hạn'],
  ['bsa54', 'Nợ phải trả'],
  ['bsa78'],
  ['bsa90', 'Lợi nhuận chưa phân phối'],
];
const BANK_BS: [string, string?][] = [
  ['bsa53', 'Tổng tài sản'],
  ['bsb104', 'Cho vay khách hàng (gộp)'],
  ['bsb105', 'Dự phòng rủi ro cho vay khách hàng'],
  ['bsb106'],
  ['bsb113'],
  ['bsb116'],
  ['bsb112'],
  ['bsa54', 'Tổng nợ phải trả'],
  ['bsa78', 'Vốn chủ sở hữu'],
  ['bsa90', 'Lợi nhuận chưa phân phối'],
];
const CORP_CF: [string, string?][] = [
  ['cfa1', 'Lợi nhuận trước thuế'],
  ['cfa2', 'Khấu hao'],
  ['cfa18', 'Dòng tiền từ hoạt động kinh doanh'],
  ['cfa19', 'Chi mua sắm, xây dựng TSCĐ'],
  ['cfa26', 'Dòng tiền từ hoạt động đầu tư'],
  ['cfa29', 'Tiền vay nhận được'],
  ['cfa30', 'Tiền trả nợ gốc vay'],
  ['cfa32', 'Cổ tức đã trả'],
  ['cfa34', 'Dòng tiền từ hoạt động tài chính'],
  ['cfa35', 'Lưu chuyển tiền thuần trong kỳ'],
];

interface VcMetric {
  field: string | null;
  level: number;
  titleVi: string;
}

interface VcShareholder {
  ownerName: string;
  ownerType: string;
  positionName: string | null;
  percentage: number;
  publicDate: string;
}

interface VcInsider {
  publicDate: string;
  endDate?: string;
  traderNameVi: string | null;
  eventTitleVi?: string;
  shareBeforeTrade?: number | null;
  shareAfterTrade?: number | null;
  traderPositionVi?: string | null;
  relativeNameVi?: string | null;
  actionTypeCode: string;
  actionTypeVi: string;
  tradeStatusVi: string;
  shareAcquire: number;
  ownershipAfterTrade?: number | null;
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
  '&ocirc;': 'ô',
  '&oacute;': 'ó',
  '&ograve;': 'ò',
  '&otilde;': 'õ',
  '&aacute;': 'á',
  '&agrave;': 'à',
  '&atilde;': 'ã',
  '&acirc;': 'â',
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&ecirc;': 'ê',
  '&iacute;': 'í',
  '&igrave;': 'ì',
  '&uacute;': 'ú',
  '&ugrave;': 'ù',
  '&yacute;': 'ý',
  '&amp;': '&',
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
  '&Ocirc;': 'Ô',
  '&Aacute;': 'Á',
  '&Eacute;': 'É',
  '&Uacute;': 'Ú',
  '&Ecirc;': 'Ê',
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
