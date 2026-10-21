import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import {
  buildChart,
  buildMetricRows,
  buildNotes,
  CompanyKind,
  COMPARE_RANGES,
  CompareInputError,
  extractMetrics,
  MetricKey,
  MetricValue,
  parseCompareRange,
  parseCompareSymbols,
  periodReturns,
  ReturnsByPeriod,
  StatsRow,
} from './compare';
import { dividendHistory } from './dividends';
import { MarketService } from './market.service';
import { Candle, VietcapProvider } from './providers/vietcap.provider';
import { vnDateKey } from './types';

export interface CompareStock {
  symbol: string;
  name: string | null;
  sector: string | null;
  kind: CompanyKind | null;
  price: number | null;
  changePct: number | null;
  marketCapBn: number | null;
  returns: ReturnsByPeriod;
  held: boolean;
  watched: boolean;
  unavailable: string[];
}

/** Đủ cho hiệu suất 1 năm và YTD; dùng cùng số phiên với trang chi tiết để dùng chung cache nến */
const HISTORY_SESSIONS = 400;
const HISTORY_SESSIONS_3Y = 1110;

/** Ghép dữ liệu nhiều nguồn cho màn so sánh; phép tính nằm ở compare.ts */
@Injectable()
export class CompareService {
  constructor(
    private market: MarketService,
    private vietcap: VietcapProvider,
    private prisma: PrismaService,
  ) {}

  async compare(userId: string, rawSymbols: string | undefined, rawRange: string | undefined) {
    let symbols: string[];
    let range: ReturnType<typeof parseCompareRange>;
    try {
      symbols = parseCompareSymbols(rawSymbols);
      range = parseCompareRange(rawRange);
    } catch (e) {
      if (e instanceof CompareInputError) throw new BadRequestException(e.message);
      throw e;
    }
    const infos = await this.validateSymbols(symbols);
    const sessions = COMPARE_RANGES[range] > 365 ? HISTORY_SESSIONS_3Y : HISTORY_SESSIONS;

    const [loaded, owned] = await Promise.all([
      Promise.all(symbols.map((s) => this.load(s, sessions))),
      this.ownership(userId, symbols),
    ]);

    const stocks: CompareStock[] = loaded.map((d, i) => ({
      symbol: d.symbol,
      name: asText(d.company?.name) ?? (infos[i].name || null),
      sector: asText(d.company?.sector),
      kind: d.kind,
      price: d.quote?.price ?? null,
      changePct: d.quote?.changePct ?? null,
      marketCapBn: d.company && Number.isFinite(d.company.marketCapBn) ? d.company.marketCapBn : null,
      returns: periodReturns(d.candles ?? []),
      held: owned.held.has(d.symbol),
      watched: owned.watched.has(d.symbol),
      unavailable: d.unavailable,
    }));

    const metricsBySymbol = Object.fromEntries(
      loaded.map((d) => [
        d.symbol,
        extractMetrics({
          kind: d.kind,
          price: d.quote?.price ?? null,
          stats: d.stats,
          incomeYears: d.incomeYears,
          dividends: d.events ? dividendHistory(d.events, d.quote?.price ?? null, vnDateKey()) : null,
        }),
      ]),
    ) as Record<string, Record<MetricKey, MetricValue>>;

    return {
      stocks,
      chart: buildChart(Object.fromEntries(loaded.map((d) => [d.symbol, d.candles ?? []])), range),
      metrics: buildMetricRows(symbols, metricsBySymbol),
      notes: buildNotes(Object.fromEntries(loaded.map((d) => [d.symbol, d.kind]))),
      source: 'Vietcap' as const,
      asOf: new Date().toISOString(),
    };
  }

  /** Mã phải tồn tại và là cổ phiếu; liệt kê đủ mã sai trong một thông báo */
  private async validateSymbols(symbols: string[]) {
    const infos = await Promise.all(symbols.map((s) => this.vietcap.lookup(s)));
    const invalid = symbols.filter((_, i) => !infos[i] || infos[i].type !== 'STOCK');
    if (invalid.length) throw new BadRequestException(`Không tìm thấy mã cổ phiếu: ${invalid.join(', ')}`);
    return infos as NonNullable<(typeof infos)[number]>[];
  }

  /** Một nguồn lỗi chỉ làm null phần của nó và được ghi vào unavailable, không làm hỏng cả trang */
  private async load(symbol: string, sessions: number) {
    const unavailable: string[] = [];
    const guard = async <T>(name: string, fn: () => Promise<T | null>): Promise<T | null> => {
      const v = await this.vietcap.safe<T | null>(`compare ${symbol} ${name}`, fn, null);
      if (v === null) unavailable.push(name);
      return v;
    };
    const [quote, company, kind, stats, incomeYears, candles, events] = await Promise.all([
      guard('price', () => this.market.stockQuote(symbol)),
      guard('company', () => this.vietcap.company(symbol)),
      guard('kind', () => this.vietcap.kind(symbol)),
      guard('ratios', () => this.vietcap.statsRaw(symbol) as Promise<StatsRow[]>),
      guard('income', () => this.vietcap.incomeYears(symbol)),
      guard<Candle[]>('history', () => this.vietcap.history(symbol, sessions)),
      guard('dividends', () => this.vietcap.corporateEvents(symbol)),
    ]);
    return { symbol, quote, company, kind, stats, incomeYears, candles, events, unavailable };
  }

  private async ownership(userId: string, symbols: string[]) {
    const where = { userId, assetType: 'stock', symbol: { in: symbols } };
    const [holdings, watch] = await Promise.all([
      this.prisma.holding.findMany({ where: { ...where, quantity: { gt: 0 } }, select: { symbol: true } }),
      this.prisma.watchItem.findMany({ where, select: { symbol: true } }),
    ]);
    return {
      held: new Set(holdings.map((h) => h.symbol)),
      watched: new Set(watch.map((w) => w.symbol)),
    };
  }
}

/** Vietcap trả trường company dạng unknown: chỉ nhận chuỗi không rỗng */
function asText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
