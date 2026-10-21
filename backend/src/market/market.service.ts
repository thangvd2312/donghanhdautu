import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.module';
import { BinanceProvider, FEATURED_COINS } from './providers/binance.provider';
import { GoldFxProvider, OZ_PER_LUONG } from './providers/gold-fx.provider';
import { VietcapProvider } from './providers/vietcap.provider';
import { dividendHistory } from './dividends';
import { valuationBand } from './fundamentals';
import { ageStatus, PriceInfo, SourceStatus, STALE_AFTER_MS, stockStatus, worst } from './freshness';
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
  vnDateKey,
} from './types';

export type MarketEvent =
  | { type: 'stocks'; data: StockQuote[] }
  | { type: 'indices'; data: IndexQuote[] }
  | { type: 'crypto'; data: CryptoQuote[] }
  | { type: 'gold'; data: GoldQuote[] }
  | { type: 'fx'; data: FxRate[] }
  | { type: 'usdt'; data: UsdtRate };

export type AssetType = 'stock' | 'crypto' | 'gold' | 'cash';

type SourceKey = 'stocks' | 'indices' | 'gold' | 'fx' | 'usdt';

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
  private timers: NodeJS.Timeout[] = [];
  private pendingCrypto = new Map<string, CryptoQuote>();

  constructor(
    private vietcap: VietcapProvider,
    readonly binance: BinanceProvider,
    private goldFx: GoldFxProvider,
    private prisma: PrismaService,
  ) {}

  async onApplicationBootstrap() {
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

  /** Theo dõi VN30 + mọi mã cổ phiếu người dùng đang nắm giữ, quan tâm hoặc đặt cảnh báo giá */
  async refreshTracked() {
    this.vn30 = await this.vietcap.safe('VN30', () => this.vietcap.group('VN30'), this.vn30);
    // Thử tải lại danh sách mã nếu lần trước lỗi (đã tải được thì là no-op)
    await this.vietcap.allSymbols().catch(() => null);
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
      this.fetchSource('stocks', () => this.vietcap.board([...this.tracked]), []),
      this.fetchSource('indices', () => this.vietcap.indices(), this.indices),
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
    const [q] = await this.vietcap.board([symbol]);
    if (!q) throw new NotFoundException(`Không có dữ liệu giá cho ${symbol}`);
    this.stocks.set(symbol, q);
    this.stockFetchedAt.set(symbol, new Date());
    this.tracked.add(symbol);
    return q;
  }

  async assertStock(symbol: string) {
    const info = await this.vietcap.lookup(symbol.toUpperCase());
    if (!info) throw new NotFoundException(`Không tìm thấy mã chứng khoán ${symbol}`);
    return info;
  }

  async searchStocks(q: string) {
    const s = q.trim().toUpperCase();
    if (!s) return [];
    const all = await this.vietcap.allSymbols().catch(() => null);
    if (!all) {
      const one = await this.vietcap.lookup(s);
      return one ? [one] : [];
    }
    const exact = all.get(s);
    const rest = [...all.values()].filter(
      (x) => x !== exact && x.type === 'STOCK' && (x.symbol.startsWith(s) || x.name.toUpperCase().includes(s)),
    );
    return [...(exact ? [exact] : []), ...rest].slice(0, 15);
  }

  async stockDetail(symbol: string) {
    symbol = symbol.toUpperCase();
    const [quote, company, ratios, income, candles] = await Promise.all([
      this.stockQuote(symbol),
      this.vietcap.safe('company', () => this.vietcap.company(symbol), null),
      this.vietcap.safe('ratios', () => this.vietcap.ratios(symbol), []),
      this.vietcap.safe('income', () => this.vietcap.incomeStatement(symbol), null),
      this.vietcap.safe('history', () => this.vietcap.history(symbol, 400), []),
    ]);
    return { quote, company, ratios, income, technicals: technicals(candles) };
  }

  /** Dải P/E, P/B ~8 năm của chính doanh nghiệp so với định giá theo giá hiện tại */
  async valuationHistory(symbol: string, price?: number | null) {
    symbol = symbol.toUpperCase();
    const rows = await this.vietcap.statsRaw(symbol);
    return valuationBand(rows, price ?? this.stocks.get(symbol)?.price ?? null);
  }

  /** Dữ liệu cơ bản sâu: định giá lịch sử, cân đối kế toán, dòng tiền, cổ đông lớn, giao dịch nội bộ */
  async stockFundamentals(symbol: string, price?: number | null) {
    symbol = symbol.toUpperCase();
    const v = this.vietcap;
    // Mã ngoài bảng giá đang theo dõi: lấy giá hiện tại để định giá theo giá mới nhất
    price ??= this.stocks.get(symbol)?.price ?? (await this.stockQuote(symbol).catch(() => null))?.price ?? null;
    const [valuationHistory, balanceSheet, cashFlow, majorShareholders, insiderTrades] = await Promise.all([
      v.safe('valuation', () => this.valuationHistory(symbol, price), null),
      v.safe('balance', () => v.balanceSheet(symbol), null),
      v.safe('cashflow', () => v.cashFlow(symbol), null),
      v.safe('shareholders', () => v.shareholders(symbol), null),
      v.safe('insider', () => v.insiderTrades(symbol), null),
    ]);
    return { valuationHistory, balanceSheet, cashFlow, majorShareholders, insiderTrades };
  }

  /** Lịch sử cổ tức tiền mặt / cổ phiếu (sự kiện quyền Vietcap từ 2018) và tỷ suất cổ tức 12 tháng theo giá hiện tại */
  async stockDividends(symbol: string) {
    symbol = symbol.toUpperCase();
    await this.assertStock(symbol);
    const [events, quote] = await Promise.all([
      this.vietcap.corporateEvents(symbol),
      this.stockQuote(symbol).catch(() => null),
    ]);
    return { ...dividendHistory(events, quote?.price ?? null, vnDateKey()), source: 'Vietcap', since: '2018' };
  }

  stockHistory(symbol: string, days: number) {
    return this.vietcap.history(symbol.toUpperCase(), days);
  }

  async cryptoDetail(symbol: string) {
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

  cryptoHistory(symbol: string, days: number) {
    return this.binance.history(normalizeCrypto(symbol), days);
  }

  /** Giá hiện tại quy ra VND/đơn vị. Vàng tính theo giá MUA VÀO của cửa hàng (giá bạn bán được) */
  priceVnd(assetType: AssetType, symbol: string): number | null {
    switch (assetType) {
      case 'stock':
        return this.stocks.get(symbol)?.price ?? null;
      case 'crypto': {
        const q = this.binance.quotes.get(normalizeCrypto(symbol));
        return q ? q.price * this.usdtVnd.rate : null;
      }
      case 'gold': {
        const g = this.gold.find((x) => x.code === symbol);
        return g ? g.buy : null;
      }
      case 'cash':
        return 1;
    }
  }

  /** Giá hiện tại quy ra VND kèm nguồn, thời điểm dữ liệu và trạng thái (mới / cũ / dự phòng / thiếu) */
  priceInfo(assetType: AssetType, symbol: string, now = new Date()): PriceInfo {
    switch (assetType) {
      case 'stock': {
        const q = this.stocks.get(symbol);
        const fetchedAt = this.stockFetchedAt.get(symbol) ?? null;
        if (!q)
          return { value: null, status: 'missing', source: 'Vietcap', asOf: null, reason: 'Chưa lấy được giá mã này' };
        const status = stockStatus(fetchedAt, now);
        return {
          value: q.price,
          status,
          source: 'Vietcap',
          asOf: fetchedAt?.toISOString() ?? null,
          reason: status === 'stale' ? 'Quá lâu chưa cập nhật được giá từ nguồn' : undefined,
        };
      }
      case 'crypto': {
        const q = this.binance.quotes.get(normalizeCrypto(symbol));
        if (!q)
          return {
            value: null,
            status: 'missing',
            source: 'Binance',
            asOf: null,
            reason: 'Chưa lấy được giá coin này',
          };
        const fx = this.usdtVnd;
        // Coin ít giao dịch có thể lâu không đổi giá: chỉ coi là cũ khi cả luồng giá Binance ngừng cập nhật
        const priceStatus = ageStatus(this.binance.lastMessageAt ?? new Date(q.time), STALE_AFTER_MS.crypto, now);
        const status = worst(priceStatus, fx.status);
        return {
          value: q.price * fx.rate,
          status,
          source: `Binance; quy đổi theo ${fx.source}`,
          asOf: new Date(q.time).toISOString(),
          reason:
            fx.status === 'fallback'
              ? 'Quy ra VND bằng tỷ giá dự phòng'
              : status === 'stale'
                ? priceStatus === 'stale'
                  ? 'Giá coin quá lâu chưa cập nhật'
                  : 'Tỷ giá USDT/VND quá lâu chưa cập nhật'
                : undefined,
        };
      }
      case 'gold': {
        const g = this.gold.find((x) => x.code === symbol);
        if (!g)
          return {
            value: null,
            status: 'missing',
            source: 'vang.today',
            asOf: null,
            reason: 'Nguồn không còn loại vàng này',
          };
        const status = ageStatus(new Date(g.updatedAt), STALE_AFTER_MS.gold, now);
        return {
          value: g.buy,
          status,
          source: g.source,
          asOf: g.updatedAt,
          reason: status === 'stale' ? 'Giá vàng của nguồn đã lâu chưa cập nhật' : undefined,
        };
      }
      case 'cash': {
        if (symbol !== 'USDT') return { value: 1, status: 'fresh', source: 'Sổ giao dịch', asOf: null };
        // Tiền mặt USDT (trên sàn): quy VND theo tỷ giá USDT/VND hiện tại
        const fx = this.usdtVnd;
        return {
          value: fx.rate,
          status: fx.status,
          source: fx.source,
          asOf: fx.asOf,
          reason: fx.status === 'fallback' ? 'Quy ra VND bằng tỷ giá dự phòng' : undefined,
        };
      }
    }
  }

  /** % thay đổi trong ngày (cổ phiếu: so tham chiếu; coin: 24h; vàng: so hôm trước) */
  dayChangePct(assetType: AssetType, symbol: string): number | null {
    switch (assetType) {
      case 'stock':
        return this.stocks.get(symbol)?.changePct ?? null;
      case 'crypto':
        return this.binance.quotes.get(normalizeCrypto(symbol))?.changePct ?? null;
      case 'gold': {
        const g = this.gold.find((x) => x.code === symbol);
        if (!g || !g.buy) return null;
        return (g.changeBuy / (g.buy - g.changeBuy)) * 100;
      }
      default:
        return null;
    }
  }
}

export function normalizeCrypto(symbol: string) {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.endsWith('USDT') ? s : `${s}USDT`;
}

export interface FxInfo {
  rate: number;
  source: string;
  status: PriceInfo['status'];
  asOf: string | null;
}

function emptyStatus(source: string): SourceStatus {
  return { source, lastSuccessAt: null, lastErrorAt: null, lastError: null };
}
