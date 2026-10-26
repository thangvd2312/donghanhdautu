import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { AssetType, Candle, CryptoDetail, StockHit } from '@dautu/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AppRuntime } from '../runtime/app-role';
import { BinanceProvider, FEATURED_COINS } from './providers/binance.provider';
import { GoldFxProvider, OZ_PER_LUONG } from './providers/gold-fx.provider';
import { safe, VietcapHistoryAdapter, VietcapQuotesAdapter, VietcapSymbolsAdapter } from './providers/vietcap';
import { normalizeCrypto } from './crypto-symbol';
import { ageStatus, PriceInfo, SourceStatus, STALE_AFTER_MS, stockStatus } from './freshness';
import { OnDemandGate } from './on-demand-gate';
import type { SourceKey } from './on-demand-gate';
import { dayChangePct, priceInfo, priceVnd } from './price-info';
import type { FxInfo, PriceBook } from './price-info';
import { technicals } from './technicals';
import {
  CryptoQuote,
  FxRate,
  GoldQuote,
  IndexQuote,
  isStockSessionOpen,
  MarketSnapshot,
  StockQuote,
  UsdtRate,
} from './types';

type MarketEvent =
  | { type: 'stocks'; data: StockQuote[] }
  | { type: 'indices'; data: IndexQuote[] }
  | { type: 'crypto'; data: CryptoQuote[] }
  | { type: 'gold'; data: GoldQuote[] }
  | { type: 'fx'; data: FxRate[] }
  | { type: 'usdt'; data: UsdtRate };

export type { AssetType };

/** Chỉ dùng khi chưa từng lấy được tỷ giá Vietcombank, để không chặn quy đổi; luôn gắn nhãn dự phòng */
const DEFAULT_USD_VND = 25500;

@Injectable()
export class MarketService implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger(MarketService.name);
  readonly events$ = new Subject<MarketEvent>();

  private stocks = new Map<string, StockQuote>();
  private indices: IndexQuote[] = [];
  private gold: GoldQuote[] = [];
  private fx: FxRate[] = [];
  private usdt: UsdtRate | null = null;
  private tracked = new Set<string>();
  /** Lần cuối lấy được giá từng mã cổ phiếu từ nguồn */
  private stockFetchedAt = new Map<string, Date>();
  private sources: Record<SourceKey, SourceStatus> = {
    stocks: emptyStatus('Vietcap'),
    indices: emptyStatus('Vietcap'),
    gold: emptyStatus('vang.today / BTMC'),
    fx: emptyStatus('Vietcombank'),
    usdt: emptyStatus('Binance P2P'),
  };
  /** Danh sách dự phòng khi API nhóm VN30 lỗi; được cập nhật lại từ Vietcap mỗi 5 phút */
  private vn30: string[] = [
    'ACB',
    'BID',
    'BSR',
    'CTG',
    'FPT',
    'GAS',
    'GVR',
    'HDB',
    'HPG',
    'LPB',
    'MBB',
    'MCH',
    'MSN',
    'MWG',
    'SAB',
    'SHB',
    'SSB',
    'SSI',
    'STB',
    'TCB',
    'TCX',
    'VCB',
    'VHM',
    'VIB',
    'VIC',
    'VJC',
    'VNM',
    'VPB',
    'VPL',
    'VRE',
  ];
  private trackedCrypto = new Set<string>();
  private timers: NodeJS.Timeout[] = [];
  private pendingCrypto = new Map<string, CryptoQuote>();
  /** Worker: làm mới theo yêu cầu, mỗi nguồn không gọi sớm hơn chu kỳ của nó */
  private onDemand = new OnDemandGate(
    (k) => this.sources[k].lastSuccessAt,
    (m) => this.log.warn(m),
  );
  private freshening: Promise<void> | null = null;

  constructor(
    private symbols: VietcapSymbolsAdapter,
    private quotes: VietcapQuotesAdapter,
    private priceHistory: VietcapHistoryAdapter,
    readonly binance: BinanceProvider,
    private goldFx: GoldFxProvider,
    private prisma: PrismaService,
    private runtime: AppRuntime,
  ) {}

  async onApplicationBootstrap() {
    // Worker không giữ websocket / vòng poll: giá được lấy theo yêu cầu qua ensureFresh() ngay trước mỗi việc cần giá
    if (!this.runtime.pollsRealtimeMarket) return;
    this.binance.onUpdate = (changed) => {
      for (const q of changed) this.pendingCrypto.set(q.symbol, q);
    };
    // Gom thay đổi coin, đẩy xuống client mỗi 2s thay vì mỗi tick
    this.timers.push(
      setInterval(() => {
        if (!this.pendingCrypto.size) return;
        this.events$.next({ type: 'crypto', data: [...this.pendingCrypto.values()] });
        this.pendingCrypto.clear();
      }, 2000),
    );

    await Promise.all([this.binance.start(), this.refreshTracked(), this.pollGold(), this.pollFx(), this.pollUsdt()]);
    // Lấy giá một lần lúc khởi động (để ngoài giờ vẫn có giá đóng cửa gần nhất),
    // sau đó chỉ poll mỗi 3 giây trong giờ giao dịch; ngoài giờ giá không đổi nên bỏ qua
    await this.pollStocks();

    this.loop(
      () => (isStockSessionOpen() ? this.pollStocks() : Promise.resolve()),
      () => 3000,
    );
    this.loop(
      () => this.pollGold(),
      () => 5 * 60_000,
    );
    this.loop(
      () => this.pollFx(),
      () => 30 * 60_000,
    );
    this.loop(
      () => this.pollUsdt(),
      () => 5 * 60_000,
    );
    this.loop(
      () => this.refreshTracked(),
      () => 5 * 60_000,
    );
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  private loop(fn: () => Promise<void>, delay: () => number) {
    const tick = async () => {
      await fn().catch((e: Error) => this.log.warn(e.message));
      this.timers.push(setTimeout(() => void tick(), delay()));
    };
    this.timers.push(setTimeout(() => void tick(), delay()));
  }

  /**
   * Bảo đảm dữ liệu giá đủ mới cho một việc nền. Web đã có vòng poll liên tục nên không làm gì; worker (không poll)
   * gọi từng nguồn khi quá chu kỳ của nó: cổ phiếu và coin 30 giây (cổ phiếu ngoài phiên chỉ tải lại khi chưa có giá
   * đóng cửa phiên gần nhất), vàng / USDT 5 phút, tỷ giá USD 30 phút. Nhiều việc gọi cùng lúc dùng chung một lượt tải.
   * Không ném lỗi: nguồn lỗi thì giữ dữ liệu cũ và `priceInfo` tự gắn trạng thái cũ / thiếu như khi poll.
   */
  async ensureFresh(now = Date.now()): Promise<void> {
    if (this.runtime.pollsRealtimeMarket) return;
    this.freshening ??= this.refreshDue(now)
      .catch((e: Error) => this.log.warn(`Lấy giá theo yêu cầu lỗi: ${e.message}`))
      .finally(() => (this.freshening = null));
    return this.freshening;
  }

  private async refreshDue(now: number): Promise<void> {
    await this.onDemand.run('tracked', now, async () => {
      await this.refreshTracked();
      await this.refreshTrackedCrypto();
    });
    const lastStockPoll = this.sources.stocks.lastSuccessAt;
    const stocksNeeded =
      isStockSessionOpen(new Date(now)) || stockStatus(lastStockPoll ? new Date(lastStockPoll) : null) !== 'fresh';
    await Promise.all([
      stocksNeeded && this.onDemand.run('stocks', now, () => this.pollStocks(), ['stocks', 'indices']),
      this.onDemand.run('crypto', now, () => this.binance.refreshRest([...this.trackedCrypto])),
      this.onDemand.run('gold', now, () => this.pollGold(), ['gold']),
      this.onDemand.run('fx', now, () => this.pollFx(), ['fx']),
      this.onDemand.run('usdt', now, () => this.pollUsdt(), ['usdt']),
    ]);
  }

  /** Các cặp coin người dùng nắm giữ / theo dõi / đặt cảnh báo: worker lấy qua REST vì không có websocket phủ mọi cặp */
  private async refreshTrackedCrypto() {
    const [h, w, a] = await Promise.all([
      this.prisma.holding.findMany({ where: { assetType: 'crypto' }, select: { symbol: true }, distinct: ['symbol'] }),
      this.prisma.watchItem.findMany({
        where: { assetType: 'crypto' },
        select: { symbol: true },
        distinct: ['symbol'],
      }),
      this.prisma.priceAlert.findMany({
        where: { assetType: 'crypto', active: true },
        select: { symbol: true },
        distinct: ['symbol'],
      }),
    ]);
    this.trackedCrypto = new Set([...h, ...w, ...a].map((x) => normalizeCrypto(x.symbol)));
  }

  /** Theo dõi VN30 + mọi mã cổ phiếu người dùng đang nắm giữ, quan tâm hoặc đặt cảnh báo giá */
  async refreshTracked() {
    this.vn30 = await safe('VN30', () => this.symbols.group('VN30'), this.vn30);
    // Thử tải lại danh sách mã nếu lần trước lỗi (đã tải được thì là no-op)
    await this.symbols.allSymbols().catch(() => null);
    const [h, w, a] = await Promise.all([
      this.prisma.holding.findMany({ where: { assetType: 'stock' }, select: { symbol: true }, distinct: ['symbol'] }),
      this.prisma.watchItem.findMany({ where: { assetType: 'stock' }, select: { symbol: true }, distinct: ['symbol'] }),
      this.prisma.priceAlert.findMany({
        where: { assetType: 'stock', active: true },
        select: { symbol: true },
        distinct: ['symbol'],
      }),
    ]);
    this.tracked = new Set([...this.vn30, ...[...h, ...w, ...a].map((x) => x.symbol)]);
  }

  /** Gọi nguồn, ghi lại lần thành công/lỗi; lỗi thì trả về giá trị dự phòng (thường là dữ liệu cũ) */
  private async fetchSource<T>(key: SourceKey, fn: () => Promise<T>, fallback: T): Promise<T> {
    const st = this.sources[key];
    try {
      const v = await fn();
      st.lastSuccessAt = new Date().toISOString();
      return v;
    } catch (e) {
      const msg = (e as Error).message;
      this.log.warn(`${key}: ${msg}`);
      st.lastErrorAt = new Date().toISOString();
      st.lastError = msg;
      return fallback;
    }
  }

  private async pollStocks() {
    const [quotes, indices] = await Promise.all([
      this.fetchSource('stocks', () => this.quotes.board([...this.tracked]), []),
      this.fetchSource('indices', () => this.quotes.indices(), this.indices),
    ]);
    const now = new Date();
    for (const q of quotes) {
      this.stocks.set(q.symbol, q);
      this.stockFetchedAt.set(q.symbol, now);
    }
    this.indices = indices;
    if (quotes.length) this.events$.next({ type: 'stocks', data: quotes });
    this.events$.next({ type: 'indices', data: indices });
  }

  private async pollGold() {
    this.gold = await this.fetchSource('gold', () => this.goldFx.gold(this.gold), this.gold);
    this.events$.next({ type: 'gold', data: this.gold });
  }

  private async pollFx() {
    this.fx = await this.fetchSource('fx', () => this.goldFx.fx(), this.fx);
    this.events$.next({ type: 'fx', data: this.fx });
  }

  private async pollUsdt() {
    this.usdt = await this.fetchSource('usdt', () => this.goldFx.usdtVnd(), this.usdt);
    if (this.usdt) this.events$.next({ type: 'usdt', data: this.usdt });
  }

  /** Tỷ giá USD/VND chuyển khoản Vietcombank — dùng quy đổi vàng thế giới */
  get usdVnd() {
    return this.usdVndInfo.rate;
  }

  get usdVndInfo(): FxInfo {
    const usd = this.fx.find((f) => f.code === 'USD');
    if (!usd?.transfer) {
      return {
        rate: DEFAULT_USD_VND,
        source: 'Giá trị mặc định (chưa lấy được tỷ giá Vietcombank)',
        status: 'fallback',
        asOf: null,
      };
    }
    const fetched = this.sources.fx.lastSuccessAt;
    return {
      rate: usd.transfer,
      source: 'Vietcombank',
      status: ageStatus(fetched ? new Date(fetched) : null, STALE_AFTER_MS.fx),
      asOf: usd.updatedAt || fetched,
    };
  }

  /** Tỷ giá USDT/VND dùng quy đổi coin: giá giữa P2P, lỗi thì lùi về tỷ giá USD Vietcombank */
  get usdtVnd(): FxInfo {
    if (this.usdt) {
      return {
        rate: this.usdt.mid,
        source: 'Binance P2P',
        status: ageStatus(new Date(this.usdt.updatedAt), STALE_AFTER_MS.usdt),
        asOf: this.usdt.updatedAt,
      };
    }
    const usd = this.usdVndInfo;
    return {
      rate: usd.rate,
      source: usd.status === 'fallback' ? usd.source : 'Vietcombank USD (dự phòng)',
      status: 'fallback',
      asOf: usd.asOf,
    };
  }

  get stockSessionOpen() {
    return isStockSessionOpen();
  }

  /** null khi chưa có tỷ giá thật: không quy đổi bằng tỷ giá mặc định */
  worldGoldVndPerLuong() {
    const xau = this.gold.find((g) => g.code === 'XAUUSD');
    const usd = this.usdVndInfo;
    return xau && usd.status !== 'fallback' ? Math.round(xau.buy * OZ_PER_LUONG * usd.rate) : null;
  }

  /** Trạng thái từng nguồn dữ liệu (lần lấy thành công/lỗi gần nhất) */
  sourceStatus(): Record<SourceKey | 'crypto', SourceStatus> {
    return {
      ...this.sources,
      crypto: {
        source: 'Binance',
        lastSuccessAt: this.binance.lastMessageAt?.toISOString() ?? null,
        lastErrorAt: null,
        lastError: null,
      },
    };
  }

  snapshot(): MarketSnapshot {
    return {
      indices: this.indices,
      stocks: this.vn30.map((s) => this.stocks.get(s)).filter((q): q is StockQuote => !!q),
      crypto: FEATURED_COINS.map((s) => this.binance.quotes.get(s)).filter((q): q is CryptoQuote => !!q),
      gold: this.gold,
      fx: this.fx,
      usdt: this.usdt,
      worldGoldVndPerLuong: this.worldGoldVndPerLuong(),
      stockSessionOpen: isStockSessionOpen(),
      sources: this.sourceStatus(),
      generatedAt: new Date().toISOString(),
    };
  }

  stocksFor(symbols: string[]) {
    return symbols.map((s) => this.stocks.get(s)).filter((q): q is StockQuote => !!q);
  }

  goldQuotes() {
    return this.gold;
  }

  async stockQuote(symbol: string): Promise<StockQuote> {
    symbol = symbol.toUpperCase();
    const cached = this.stocks.get(symbol);
    if (cached) return cached;
    await this.assertStock(symbol);
    const [q] = await this.quotes.board([symbol]);
    if (!q) throw new NotFoundException(`Không có dữ liệu giá cho ${symbol}`);
    this.stocks.set(symbol, q);
    this.stockFetchedAt.set(symbol, new Date());
    this.tracked.add(symbol);
    return q;
  }

  async assertStock(symbol: string) {
    const info = await this.symbols.lookup(symbol.toUpperCase());
    if (!info) throw new NotFoundException(`Không tìm thấy mã chứng khoán ${symbol}`);
    return info;
  }

  /** Mã cổ phiếu đang niêm yết / đăng ký giao dịch; null khi chưa lấy được danh sách */
  async stockSymbols(): Promise<Set<string> | null> {
    const all = await this.symbols.allSymbols().catch(() => null);
    return all ? new Set(all.keys()) : null;
  }

  async searchStocks(q: string): Promise<StockHit[]> {
    const s = q.trim().toUpperCase();
    if (!s) return [];
    const all = await this.symbols.allSymbols().catch(() => null);
    if (!all) {
      const one = await this.symbols.lookup(s);
      return one ? [one] : [];
    }
    const exact = all.get(s);
    const rest = [...all.values()].filter(
      (x) => x !== exact && x.type === 'STOCK' && (x.symbol.startsWith(s) || x.name.toUpperCase().includes(s)),
    );
    return [...(exact ? [exact] : []), ...rest].slice(0, 15);
  }

  stockHistory(symbol: string, days: number): Promise<Candle[]> {
    return this.priceHistory.history(symbol.toUpperCase(), days);
  }

  async cryptoDetail(symbol: string): Promise<CryptoDetail> {
    symbol = normalizeCrypto(symbol);
    const candles = await this.binance.history(symbol, 400);
    const quote = this.binance.quotes.get(symbol) ?? null;
    const usdt = this.usdtVnd;
    return {
      quote,
      usdtVnd: usdt.rate,
      usdtSource: usdt.source,
      usdtStatus: usdt.status,
      technicals: technicals(candles),
    };
  }

  cryptoHistory(symbol: string, days: number): Promise<Candle[]> {
    return this.binance.history(normalizeCrypto(symbol), days);
  }

  /** Giá hiện tại quy ra VND/đơn vị. Vàng tính theo giá MUA VÀO của cửa hàng (giá bạn bán được) */
  priceVnd(assetType: AssetType, symbol: string): number | null {
    return priceVnd(this.priceBook, assetType, symbol);
  }

  /** Giá hiện tại quy ra VND kèm nguồn, thời điểm dữ liệu và trạng thái (mới / cũ / dự phòng / thiếu) */
  priceInfo(assetType: AssetType, symbol: string, now = new Date()): PriceInfo {
    return priceInfo(this.priceBook, assetType, symbol, now);
  }

  /** % thay đổi trong ngày (cổ phiếu: so tham chiếu; coin: 24h; vàng: so hôm trước) */
  dayChangePct(assetType: AssetType, symbol: string): number | null {
    return dayChangePct(this.priceBook, assetType, symbol);
  }

  private get priceBook(): PriceBook {
    return {
      stocks: this.stocks,
      stockFetchedAt: this.stockFetchedAt,
      gold: this.gold,
      crypto: this.binance,
      usdtVnd: () => this.usdtVnd,
    };
  }
}

function emptyStatus(source: string): SourceStatus {
  return { source, lastSuccessAt: null, lastErrorAt: null, lastError: null };
}
