import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketService, normalizeCrypto } from '../market/market.service';
import { VndirectProvider } from '../market/providers/vndirect.provider';
import type { AssetType } from '../market/market.service';
import { VN_TZ, vnDateKey } from '../market/types';
import { addDays, daysBetween } from '../plans/plan-rules';
import { PrismaService } from '../prisma/prisma.module';
import { assetBreakdown, buildHistory, compareBenchmark, DayPrice, periodPerformance } from './history';
import { ledgerOfAll } from './ledger';
import { toLedgerTx, TransactionsService } from './transactions';

export const RANGES = { '1m': 30, '3m': 90, '6m': 180, '1y': 365, all: 1100 } as const;
export type Range = keyof typeof RANGES;

/** Cách tối đa (ngày) giữa ngày cần giá và ngày có giá gần nhất trước đó để vẫn coi là giá đúng */
const MAX_GAP: Record<string, number> = { stock: 5, crypto: 2, gold: 4 };

type Series = Map<string, number>;

/**
 * Lịch sử tài sản theo ngày. Giá đóng cửa: cổ phiếu từ lịch sử nến Vietcap/DNSE, coin từ Binance,
 * vàng và tỷ giá USDT từ bảng PriceDaily (app tự lưu mỗi ngày — trước đó không có nguồn lịch sử).
 * Ngày hôm nay dùng giá hiện tại.
 */
@Injectable()
export class HistoryService implements OnApplicationBootstrap {
  private log = new Logger(HistoryService.name);
  private cryptoCache = new Map<string, { at: number; series: Series }>();

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private transactions: TransactionsService,
    private vndirect: VndirectProvider,
  ) {}

  /** Lưu giá ngay sau khi khởi động (chờ dữ liệu thị trường tải xong) để có mốc của hôm nay */
  onApplicationBootstrap() {
    setTimeout(() => void this.recordDaily().catch((e: Error) => this.log.warn(e.message)), 90_000).unref();
  }

  async history(userId: string, range: string, portfolioId?: string) {
    if (!(range in RANGES)) throw new BadRequestException('Khoảng thời gian không hợp lệ');
    const r = await this.compute(
      userId,
      (firstTx, today) => (range === 'all' ? firstTx : addDays(today, -RANGES[range as Range])),
      portfolioId,
    );
    if (!r) return { range, points: [], period: null, benchmark: null, notes: [] };
    return { range, points: r.points, period: r.period, benchmark: await this.benchmark(r), notes: r.notes };
  }

  /**
   * So TWR của kỳ với VN-Index cùng kỳ. Lỗi nguồn chỉ số thì trả null (không làm hỏng lịch sử).
   * Tỷ trọng cổ phiếu VN cuối kỳ quyết định có nên coi VN-Index là thước đo phù hợp hay không.
   */
  private async benchmark(r: NonNullable<Awaited<ReturnType<HistoryService['compute']>>>) {
    const period = r.period;
    if (!period || period.twrPct === null) return null;
    try {
      const sessions = Math.min(1000, Math.ceil(period.days * 0.75) + 15);
      const candles = await this.market.stockHistory('VNINDEX', sessions);
      const closes = new Map(candles.map((c) => [vnDateKey(new Date(c.time * 1000)), c.close]));
      const current = this.market.snapshot().indices.find((i) => i.symbol === 'VNINDEX')?.price ?? null;
      const end = assetBreakdown(ledgerOfAll(r.txs), r.today, r.price, r.usdt, (t, sym) => this.displayName(t, sym));
      const total = end.reduce((s, a) => s + a.value, 0);
      const stocks = end.filter((a) => a.assetType === 'stock').reduce((s, a) => s + a.value, 0);
      return compareBenchmark(
        period,
        period.baseDate,
        { name: 'VN-Index', closes, current, today: r.today },
        total > 0 ? stocks / total : 0,
      );
    } catch (e) {
      this.log.warn(`So sánh VN-Index: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Số liệu một tuần (7 ngày tới hôm nay) cho bản tổng kết: hiệu quả trong kỳ, giá trị và tỷ trọng từng tài sản
   * đầu / cuối tuần, tài sản có giao dịch trong tuần. Mọi con số tính ở đây; AI chỉ diễn giải.
   */
  async weekSummary(userId: string) {
    const r = await this.compute(userId, (_first, today) => addDays(today, -7));
    if (!r || !r.points.length) return null;
    const end = r.today;
    const start = r.points[0].date > r.from ? null : r.from;
    const ledgerAt = (d: string) => ledgerOfAll(r.txs.filter((t) => t.date <= d));
    const name = (t: string, sym: string) => this.displayName(t, sym);
    const after = assetBreakdown(ledgerAt(end), end, r.price, r.usdt, name);
    const before = start ? assetBreakdown(ledgerAt(start), start, r.price, r.usdt, name) : [];
    const traded = new Set(
      r.txs.filter((t) => t.date > (start ?? '') && t.symbol).map((t) => `${t.assetType}:${t.symbol}`),
    );
    const keys = [...new Set([...before, ...after].map((a) => a.key))];
    const assets = keys.map((k) => {
      const b = before.find((a) => a.key === k);
      const a = after.find((x) => x.key === k);
      const ref = (a ?? b)!;
      // % đổi giá theo giá điều chỉnh: tuần có cổ phiếu thưởng không bị tính là "giảm giá"
      const cStart = start && ref.assetType !== 'cash' ? r.changePrice(ref.assetType, ref.symbol, start) : null;
      const cEnd = ref.assetType !== 'cash' ? r.changePrice(ref.assetType, ref.symbol, end) : null;
      return {
        name: ref.name,
        assetType: ref.assetType,
        valueStart: b?.value ?? 0,
        valueEnd: a?.value ?? 0,
        /** % đổi giá trong tuần (theo giá, không tính mua/bán) */
        priceChangePct: cStart && cEnd ? ((cEnd - cStart) / cStart) * 100 : null,
        /** Ảnh hưởng của biến động giá lên số đang giữ đầu tuần (VND) */
        // Giá trị đầu tuần × % đổi giá (giá điều chỉnh): cổ phiếu thưởng trong tuần không bị tính là lỗ do giá
        priceEffect: b && b.priced && cStart && cEnd ? b.value * (cEnd / cStart - 1) : null,
        tradedThisWeek: traded.has(k),
        priced: (a?.priced ?? true) && (b?.priced ?? true),
      };
    });
    const totalStart = before.reduce((s, a) => s + a.value, 0);
    const totalEnd = after.reduce((s, a) => s + a.value, 0);
    const byType = (list: typeof after, total: number) => {
      const m: Record<string, number> = {};
      for (const a of list) m[a.assetType] = (m[a.assetType] ?? 0) + (total ? (a.value / total) * 100 : 0);
      return m;
    };
    return {
      from: start ?? r.points[0].date,
      to: end,
      period: r.period,
      endPoint: r.points[r.points.length - 1],
      assets,
      allocationStart: start ? byType(before, totalStart) : null,
      allocationEnd: byType(after, totalEnd),
      notes: r.notes,
    };
  }

  /** Dựng lịch sử từ ngày `fromOf(ngày giao dịch đầu, hôm nay)` tới hôm nay */
  private async compute(userId: string, fromOf: (firstTx: string, today: string) => string, portfolioId?: string) {
    const txs = (await this.transactions.activeTransactions(userId, portfolioId)).map(toLedgerTx);
    const today = vnDateKey();
    if (!txs.length) return null;
    const firstTx = txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date);
    const from = fromOf(firstTx, today);
    const loadFrom = from > firstTx ? from : firstTx;
    const days = daysBetween(loadFrom, today) + 1;

    // Tài sản từng có trong sổ (kể cả đã bán hết) cần giá trong khoảng
    const assets = [
      ...new Map(
        txs
          .filter((t) => t.assetType && t.assetType !== 'cash' && t.symbol)
          .map((t) => [`${t.assetType}:${t.symbol}`, t]),
      ).values(),
    ].map((t) => ({ assetType: t.assetType as string, symbol: t.symbol as string }));

    const series = new Map<string, Series>();
    // Cổ phiếu: giá điều chỉnh (để tính % đổi giá) và mã đang phải dùng giá điều chỉnh vì nguồn giá gốc lỗi
    const adjusted = new Map<string, Series>();
    const adjustedOnly = new Set<string>();
    const failed: string[] = [];
    await Promise.all(
      assets.map(async (a) => {
        const key = `${a.assetType}:${a.symbol}`;
        try {
          if (a.assetType === 'stock') {
            const s = await this.loadStock(a.symbol, loadFrom, today, days);
            series.set(key, s.raw);
            adjusted.set(key, s.adjusted);
            if (s.adjustedOnly) adjustedOnly.add(key);
            return;
          }
          series.set(key, await this.loadSeries(a.assetType, a.symbol, loadFrom, days));
        } catch (e) {
          this.log.warn(`Lịch sử giá ${a.symbol}: ${(e as Error).message}`);
          failed.push(this.displayName(a.assetType, a.symbol));
          series.set(`${a.assetType}:${a.symbol}`, new Map());
        }
      }),
    );
    const fx = await this.storedSeries('fx', 'USDTVND', loadFrom);
    if (!fx.size) fx.set(today, this.market.usdtVnd.rate);
    const fxDates = [...fx.keys()].sort();

    const price = (assetType: string, symbol: string, date: string): DayPrice => {
      if (date === today) {
        // Giá hiện tại cũ / dự phòng (vd nguồn lỗi, chỉ còn bộ nhớ đệm) vẫn dùng nhưng là ước tính
        const info = this.market.priceInfo(assetType as AssetType, symbol);
        if (info.value !== null) {
          return {
            value: assetType === 'crypto' ? info.value / this.market.usdtVnd.rate : info.value,
            estimated: info.status !== 'fresh',
          };
        }
      }
      const s = series.get(`${assetType}:${symbol}`);
      const hit = s ? lastOnOrBefore(s, date) : null;
      if (!hit) return { value: null, estimated: false };
      return {
        value: hit.value,
        // Giá đã điều chỉnh theo sự kiện quyền không khớp số cổ phiếu thật trước ngày sự kiện: chỉ là ước tính
        estimated:
          daysBetween(hit.date, date) > (MAX_GAP[assetType] ?? 3) || adjustedOnly.has(`${assetType}:${symbol}`),
      };
    };
    const usdtToday = this.market.usdtVnd;
    const usdt = (date: string) => {
      // Tỷ giá hôm nay từ nguồn cũ hoặc tỷ giá dự phòng (USD Vietcombank) không phải tỷ giá USDT thật của ngày
      if (date === today) return { rate: usdtToday.rate, estimated: usdtToday.status !== 'fresh' };
      const hit = lastOnOrBefore(fx, date, fxDates);
      // Trước khi app lưu tỷ giá: dùng tỷ giá sớm nhất đã biết, đánh dấu ước tính
      if (!hit) return { rate: fx.get(fxDates[0])!, estimated: true };
      return { rate: hit.value, estimated: daysBetween(hit.date, date) > 3 };
    };

    const points = buildHistory({
      txs,
      from: loadFrom,
      to: today,
      price,
      usdt,
      displayName: (t, s) => this.displayName(t, s),
    });
    const period = periodPerformance(points, from, firstTx);
    const notes: string[] = [];
    if (failed.length) notes.push(`Chưa lấy được lịch sử giá của ${failed.join(', ')}.`);
    if (assets.some((a) => a.assetType === 'gold') && points.some((p) => p.status === 'partial')) {
      notes.push(
        'Giá vàng lịch sử chỉ có từ ngày app bắt đầu lưu; những ngày trước đó vàng được tạm tính theo giá vốn.',
      );
    }
    if (points.some((p) => p.status === 'estimated')) {
      notes.push('Một số ngày dùng giá hoặc tỷ giá gần nhất trước đó (đánh dấu ước tính).');
    }
    if (adjustedOnly.size) {
      notes.push(
        `Chưa lấy được giá gốc của ${[...adjustedOnly].map((k) => k.split(':')[1]).join(', ')}; đang dùng giá đã điều chỉnh theo sự kiện quyền nên các ngày trước cổ phiếu thưởng / cổ tức chỉ là ước tính.`,
      );
    }
    if (assets.some((a) => a.assetType === 'crypto')) {
      notes.push('Coin: giá đóng cửa ngày theo giờ UTC của Binance.');
    }
    /** Giá để tính % đổi giá giữa hai ngày: cổ phiếu dùng giá điều chỉnh (không bị sự kiện quyền làm "rơi giá") */
    const changePrice = (assetType: string, symbol: string, date: string) => {
      const adj = adjusted.get(`${assetType}:${symbol}`);
      if (adj && date !== today) return lastOnOrBefore(adj, date)?.value ?? null;
      return price(assetType, symbol, date).value;
    };
    return { txs, from, today, points, period, notes, price, usdt, changePrice };
  }

  /**
   * Cổ phiếu: giá đóng cửa GỐC (VNDirect) để nhân với số cổ phiếu thật trong sổ, kèm giá điều chỉnh để tính % đổi giá.
   * Nguồn giá gốc lỗi thì dùng giá điều chỉnh (Vietcap) và đánh dấu ước tính.
   */
  private async loadStock(symbol: string, from: string, today: string, days: number) {
    try {
      const rows = await this.vndirect.rawCloses(symbol, addDays(from, -10), today);
      if (rows.length) {
        return {
          raw: new Map(rows.map((r) => [r.date, r.close])),
          adjusted: new Map(rows.map((r) => [r.date, r.adjClose])),
          adjustedOnly: false,
        };
      }
    } catch (e) {
      this.log.warn(`Giá gốc ${symbol} (VNDirect): ${(e as Error).message}`);
    }
    const s = await this.loadSeries('stock', symbol, from, days);
    return { raw: s, adjusted: s, adjustedOnly: true };
  }

  private async loadSeries(assetType: string, symbol: string, from: string, days: number): Promise<Series> {
    if (assetType === 'stock') {
      // Số phiên ≈ 5/7 số ngày lịch, cộng dư cho ngày nghỉ
      const candles = await this.market.stockHistory(symbol, Math.min(1000, Math.ceil(days * 0.75) + 10));
      return new Map(candles.map((c) => [vnDateKey(new Date(c.time * 1000)), c.close]));
    }
    if (assetType === 'crypto') {
      const key = `${symbol}:${days}`;
      const cached = this.cryptoCache.get(key);
      if (cached && Date.now() - cached.at < 10 * 60_000) return cached.series;
      const candles = await this.market.cryptoHistory(normalizeCrypto(symbol), Math.min(1000, days + 2));
      // Nến ngày Binance mở lúc 00:00 UTC: gán giá đóng cửa cho ngày đó
      const s: Series = new Map(candles.map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), c.close]));
      this.cryptoCache.set(key, { at: Date.now(), series: s });
      return s;
    }
    return this.storedSeries(assetType, symbol, from);
  }

  private async storedSeries(assetType: string, symbol: string, from: string): Promise<Series> {
    const rows = await this.prisma.priceDaily.findMany({
      where: { assetType, symbol, date: { gte: new Date(`${addDays(from, -10)}T00:00:00Z`) } },
      orderBy: { date: 'asc' },
    });
    return new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.close]));
  }

  private displayName(assetType: string, symbol: string) {
    if (assetType === 'gold') return this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol;
    return symbol.replace(/USDT$/, '');
  }

  /**
   * 23:50 mỗi ngày: lưu giá vàng (giá mua vào) và tỷ giá USDT/VND — hai thứ không có nguồn lịch sử.
   * Cổ phiếu và coin lấy lịch sử trực tiếp từ nguồn nên không cần lưu.
   * Chỉ lưu giá còn mới theo nguồn: bộ nhớ đệm cũ (nguồn mất nhiều ngày) hay tỷ giá dự phòng không được ghi thành giá
   * chốt của hôm nay, vì khi đọc lại ngày bản ghi được coi là ngày của giá. Ngày không có bản ghi sẽ dùng giá gần nhất
   * trước đó và tự đánh dấu ước tính khi quá xa (MAX_GAP). Cron và lần chạy sau khi khởi động cùng quy tắc này.
   */
  @Cron('50 23 * * *', { timeZone: VN_TZ })
  async recordDaily() {
    const date = new Date(`${vnDateKey()}T00:00:00Z`);
    const rows = [
      ...this.market
        .goldQuotes()
        .filter((g) => g.currency === 'VND' && g.buy > 0 && this.market.priceInfo('gold', g.code).status === 'fresh')
        .map((g) => ({ assetType: 'gold', symbol: g.code, close: g.buy, source: g.source })),
    ];
    const usdt = this.market.usdtVnd;
    if (usdt.status === 'fresh')
      rows.push({ assetType: 'fx', symbol: 'USDTVND', close: usdt.rate, source: usdt.source });
    for (const r of rows) {
      await this.prisma.priceDaily.upsert({
        where: { assetType_symbol_date: { assetType: r.assetType, symbol: r.symbol, date } },
        create: { ...r, date },
        update: { close: r.close, source: r.source },
      });
    }
    this.log.log(`Đã lưu ${rows.length} giá cuối ngày (bỏ qua giá cũ / dự phòng)`);
  }
}

/** Giá ở ngày gần nhất ≤ date */
function lastOnOrBefore(s: Series, date: string, sortedKeys?: string[]) {
  const keys = sortedKeys ?? [...s.keys()].sort();
  let lo = 0;
  let hi = keys.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : { date: keys[found], value: s.get(keys[found])! };
}
