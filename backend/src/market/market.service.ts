import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.module';
import { BinanceProvider, FEATURED_COINS } from './providers/binance.provider';
import { GoldFxProvider, OZ_PER_LUONG } from './providers/gold-fx.provider';
import { VietcapProvider } from './providers/vietcap.provider';
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

export type MarketEvent =
  | { type: 'stocks'; data: StockQuote[] }
  | { type: 'indices'; data: IndexQuote[] }
  | { type: 'crypto'; data: CryptoQuote[] }
  | { type: 'gold'; data: GoldQuote[] }
  | { type: 'fx'; data: FxRate[] }
  | { type: 'usdt'; data: UsdtRate };

export type AssetType = 'stock' | 'crypto' | 'gold' | 'cash';

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
  /** Danh sách dự phòng khi API nhóm VN30 lỗi; được cập nhật lại từ Vietcap mỗi 5 phút */
  private vn30: string[] = [
    'ACB', 'BID', 'BSR', 'CTG', 'FPT', 'GAS', 'GVR', 'HDB', 'HPG', 'LPB', 'MBB', 'MCH', 'MSN', 'MWG', 'SAB',
    'SHB', 'SSB', 'SSI', 'STB', 'TCB', 'TCX', 'VCB', 'VHM', 'VIB', 'VIC', 'VJC', 'VNM', 'VPB', 'VPL', 'VRE',
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

    await Promise.all([
      this.binance.start(),
      this.refreshTracked(),
      this.pollGold(),
      this.pollFx(),
      this.pollUsdt(),
    ]);
    // Lấy giá một lần lúc khởi động (để ngoài giờ vẫn có giá đóng cửa gần nhất),
    // sau đó chỉ poll mỗi 3 giây trong giờ giao dịch; ngoài giờ giá không đổi nên bỏ qua
    await this.pollStocks();

    this.loop(
      () => (isStockSessionOpen() ? this.pollStocks() : Promise.resolve()),
      () => 3000,
    );
    this.loop(() => this.pollGold(), () => 5 * 60_000);
    this.loop(() => this.pollFx(), () => 30 * 60_000);
    this.loop(() => this.pollUsdt(), () => 5 * 60_000);
    this.loop(() => this.refreshTracked(), () => 5 * 60_000);
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  private loop(fn: () => Promise<void>, delay: () => number) {
    const tick = async () => {
      await fn().catch((e: Error) => this.log.warn(e.message));
      this.timers.push(setTimeout(tick, delay()));
    };
    this.timers.push(setTimeout(tick, delay()));
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

  private async pollStocks() {
    const [quotes, indices] = await Promise.all([
      this.vietcap.safe('board', () => this.vietcap.board([...this.tracked]), []),
      this.vietcap.safe('indices', () => this.vietcap.indices(), this.indices),
    ]);
    for (const q of quotes) this.stocks.set(q.symbol, q);
    this.indices = indices;
    if (quotes.length) this.events$.next({ type: 'stocks', data: quotes });
    this.events$.next({ type: 'indices', data: indices });
  }

  private async pollGold() {
    this.gold = await this.vietcap.safe('gold', () => this.goldFx.gold(this.gold), this.gold);
    this.events$.next({ type: 'gold', data: this.gold });
  }

  private async pollFx() {
    this.fx = await this.vietcap.safe('fx', () => this.goldFx.fx(), this.fx);
    this.events$.next({ type: 'fx', data: this.fx });
  }

  private async pollUsdt() {
    this.usdt = await this.vietcap.safe('usdt', () => this.goldFx.usdtVnd(), this.usdt);
    if (this.usdt) this.events$.next({ type: 'usdt', data: this.usdt });
  }

  /** Tỷ giá USD/VND chuyển khoản Vietcombank — dùng quy đổi vàng thế giới */
  get usdVnd() {
    return this.fx.find((f) => f.code === 'USD')?.transfer ?? 25500;
  }

  /** Tỷ giá USDT/VND dùng quy đổi coin: giá giữa P2P, lỗi thì lùi về tỷ giá USD Vietcombank */
  get usdtVnd(): { rate: number; source: string } {
    return this.usdt
      ? { rate: this.usdt.mid, source: 'Binance P2P' }
      : { rate: this.usdVnd, source: 'Vietcombank USD (dự phòng)' };
  }

  get stockSessionOpen() {
    return isStockSessionOpen();
  }

  worldGoldVndPerLuong() {
    const xau = this.gold.find((g) => g.code === 'XAUUSD');
    return xau ? Math.round(xau.buy * OZ_PER_LUONG * this.usdVnd) : null;
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
      updatedAt: new Date().toISOString(),
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

  stockHistory(symbol: string, days: number) {
    return this.vietcap.history(symbol.toUpperCase(), days);
  }

  async cryptoDetail(symbol: string) {
    symbol = normalizeCrypto(symbol);
    const candles = await this.binance.history(symbol, 400);
    const quote = this.binance.quotes.get(symbol) ?? null;
    return { quote, usdtVnd: this.usdtVnd.rate, usdtSource: this.usdtVnd.source, technicals: technicals(candles) };
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
