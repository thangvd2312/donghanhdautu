import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PaperAccount, PaperTrade } from '@prisma/client';
import type {
  PracticeOrderResponse,
  PracticeResponse,
  PracticeState,
  PracticeTrade,
  PracticeTradesPage,
} from '@dautu/contracts';
import { MarketService } from '../market/market.service';
import { normalizeCrypto } from '../market/crypto-symbol';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanAfford,
  assertCanSell,
  benchmarkChangePct,
  computeFees,
  computePositions,
  computeTotals,
  OrderInput,
  PRACTICE_RULES,
  PracticeAssetType,
  PracticeRuleError,
  PracticeSide,
  Position,
  pricePositions,
  roundQty,
  START_CASH_OPTIONS,
  TradeRecord,
  validateOrder,
} from './practice-logic';

const TRADES_PAGE_SIZE = 30;
const BENCHMARK_TTL_MS = 30 * 60_000;
const NO_ACCOUNT = 'Bạn chưa mở tài khoản luyện tập';

interface PlaceOrderInput extends OrderInput {
  symbol: string;
}

type Db = Prisma.TransactionClient;

const num = (d: Prisma.Decimal) => d.toNumber();
const label = (assetType: string, symbol: string) => (assetType === 'crypto' ? symbol.replace(/USDT$/, '') : symbol);

/**
 * Danh mục luyện tập bằng tiền ảo (FREE-07). Chỉ đọc/ghi PaperAccount và PaperTrade; không bao giờ chạm Holding/Transaction
 * của danh mục thật và không phát sự kiện đo lường của danh mục thật.
 */
@Injectable()
export class PracticeService {
  private log = new Logger(PracticeService.name);
  private benchmarkCache: { at: number; sessions: number; closes: Map<string, number> } | null = null;

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
  ) {}

  async state(userId: string): Promise<PracticeResponse> {
    const account = await this.prisma.paperAccount.findUnique({ where: { userId } });
    return account ? this.buildState(this.prisma, account) : { account: null };
  }

  async start(userId: string, startCash: number): Promise<PracticeState> {
    assertStartCash(startCash);
    const account = await this.prisma.$transaction(async (db) => {
      await lock(db, userId);
      if (await db.paperAccount.findUnique({ where: { userId } })) {
        throw new BadRequestException('Bạn đã có tài khoản luyện tập — hãy dùng "Làm lại" nếu muốn bắt đầu lại');
      }
      return db.paperAccount.create({ data: { userId, startCash, cash: startCash, startedAt: new Date() } });
    });
    return this.buildState(this.prisma, account);
  }

  async reset(userId: string, startCash: number): Promise<PracticeState> {
    assertStartCash(startCash);
    const account = await this.prisma.$transaction(async (db) => {
      await lock(db, userId);
      const current = await db.paperAccount.findUnique({ where: { userId } });
      if (!current) throw new BadRequestException(NO_ACCOUNT);
      await db.paperTrade.deleteMany({ where: { accountId: current.id } });
      return db.paperAccount.update({
        where: { id: current.id },
        data: { startCash, cash: startCash, startedAt: new Date() },
      });
    });
    return this.buildState(this.prisma, account);
  }

  async placeOrder(userId: string, input: PlaceOrderInput): Promise<PracticeOrderResponse> {
    const { symbol, price, source } = await this.quote(input.assetType, input.symbol);
    const { trade, updated } = await this.prisma.$transaction(async (db) => {
      await lock(db, userId);
      const account = await db.paperAccount.findUnique({ where: { userId } });
      if (!account) throw new BadRequestException(NO_ACCOUNT);
      const history = await db.paperTrade.findMany({
        where: { accountId: account.id },
        orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
      });
      const { positions } = computePositions(history.map(toRecord));
      const held = positions.find((p) => p.assetType === input.assetType && p.symbol === symbol)?.quantity ?? 0;
      const fees = this.applyRules(input, held, num(account.cash), price);
      const cashAfter = input.side === 'buy' ? num(account.cash) - fees.net : num(account.cash) + fees.net;
      // Thời điểm khớp luôn tăng dần để sổ lệnh có thứ tự chắc chắn khi tính bình quân giá vốn
      const last = history.at(-1)?.executedAt.getTime() ?? 0;
      const executedAt = new Date(Math.max(Date.now(), last + 1));
      const created = await db.paperTrade.create({
        data: {
          accountId: account.id,
          assetType: input.assetType,
          symbol,
          side: input.side,
          quantity: input.quantity,
          price,
          priceSource: source,
          fee: fees.fee,
          tax: fees.tax,
          cashAfter,
          executedAt,
        },
      });
      const updated = await db.paperAccount.update({ where: { id: account.id }, data: { cash: cashAfter } });
      const all = computePositions([...history, created].map(toRecord));
      return { trade: serializeTrade(created, all.realizedPnl.at(-1) ?? null), updated };
    });
    return { trade, state: await this.buildState(this.prisma, updated) };
  }

  async trades(userId: string, cursor?: string): Promise<PracticeTradesPage> {
    const account = await this.prisma.paperAccount.findUnique({ where: { userId } });
    if (!account) return { items: [], nextCursor: null };
    if (cursor && !(await this.prisma.paperTrade.findFirst({ where: { id: cursor, accountId: account.id } }))) {
      throw new BadRequestException('Trang không hợp lệ');
    }
    const all = await this.prisma.paperTrade.findMany({
      where: { accountId: account.id },
      orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
    });
    const { realizedPnl } = computePositions(all.map(toRecord));
    const newestFirst = all.map((t, i) => serializeTrade(t, realizedPnl[i])).reverse();
    const from = cursor ? newestFirst.findIndex((t) => t.id === cursor) + 1 : 0;
    const items = newestFirst.slice(from, from + TRADES_PAGE_SIZE);
    const more = from + TRADES_PAGE_SIZE < newestFirst.length;
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  }

  /** Kiểm tra quy tắc theo thứ tự: số lượng hợp lệ, rồi tiền/số đang giữ. Lỗi quy tắc → 400 tiếng Việt */
  private applyRules(input: PlaceOrderInput, held: number, cash: number, price: number) {
    try {
      validateOrder(input, held);
      const fees = computeFees(input.assetType, input.side, input.quantity, price);
      if (input.side === 'buy') assertCanAfford(cash, fees);
      else assertCanSell(held, input.quantity);
      return fees;
    } catch (e) {
      if (e instanceof PracticeRuleError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** Giá khớp: chuẩn hoá mã, kiểm tra mã tồn tại và giá còn mới. Thiếu / cũ → từ chối kèm lý do, không dùng giá ảo */
  private async quote(assetType: PracticeAssetType, raw: string) {
    const input = raw.trim().toUpperCase();
    if (!input) throw new BadRequestException('Thiếu mã');
    let symbol = input;
    if (assetType === 'stock') {
      symbol = (await this.market.assertStock(input)).symbol;
      await this.market.stockQuote(symbol).catch(() => null);
    } else {
      symbol = normalizeCrypto(input);
    }
    const info = this.market.priceInfo(assetType, symbol);
    if (assetType === 'crypto' && info.value === null) {
      throw new BadRequestException(`Không tìm thấy coin ${label(assetType, symbol)} hoặc chưa có giá`);
    }
    if (info.value === null || !(info.value > 0) || info.status === 'missing' || info.status === 'stale') {
      throw new BadRequestException(
        `Chưa có giá đáng tin của ${label(assetType, symbol)} để khớp lệnh luyện tập` +
          (info.reason ? ` (${info.reason.toLowerCase()})` : '') +
          ' — hãy thử lại sau',
      );
    }
    return {
      symbol,
      price: info.value,
      source: info.status === 'fallback' ? `${info.source} (dự phòng)` : info.source,
    };
  }

  private async buildState(db: Db | PrismaService, account: PaperAccount): Promise<PracticeState> {
    const trades = await db.paperTrade.findMany({
      where: { accountId: account.id },
      orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
    });
    const { positions } = computePositions(trades.map(toRecord));
    await Promise.all(
      positions
        .filter((p) => p.assetType === 'stock' && this.market.priceInfo('stock', p.symbol).value === null)
        .map((p) => this.market.stockQuote(p.symbol).catch(() => null)),
    );
    const cash = num(account.cash);
    const priced = pricePositions(
      positions,
      (p: Position) => {
        const info = this.market.priceInfo(p.assetType, p.symbol);
        return { price: info.value, status: info.status, label: label(p.assetType, p.symbol) };
      },
      (v) => cash + v,
    );
    const positionsValue = priced.reduce((s, p) => s + p.value, 0);
    const feesPaid = trades.reduce((s, t) => s + num(t.fee) + num(t.tax), 0);
    return {
      account: { startCash: num(account.startCash), cash, startedAt: account.startedAt.toISOString() },
      positions: priced,
      totals: computeTotals(num(account.startCash), cash, positionsValue, trades.length, feesPaid),
      benchmark: await this.benchmark(account.startedAt),
      rules: PRACTICE_RULES,
      asOf: new Date().toISOString(),
    };
  }

  /** VN-Index cùng kỳ từ ngày bắt đầu. Lỗi nguồn → null (không làm hỏng danh mục luyện tập) */
  private async benchmark(startedAt: Date) {
    const since = startedAt.toISOString();
    try {
      const today = vnDateKey();
      const startedDate = vnDateKey(startedAt);
      const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startedDate}T00:00:00Z`)) / 86_400_000);
      const sessions = Math.min(1000, Math.ceil(days * 0.75) + 15);
      const current = this.market.snapshot().indices.find((i) => i.symbol === 'VNINDEX')?.price ?? null;
      if (days < 1 || current === null) return null;
      const closes = await this.indexCloses(sessions);
      const changePct = benchmarkChangePct(closes, current, startedDate, today);
      return { name: 'VN-Index' as const, changePct, since };
    } catch (e) {
      this.log.warn(`Chỉ số VN-Index cho danh mục luyện tập: ${(e as Error).message}`);
      return null;
    }
  }

  private async indexCloses(sessions: number) {
    const c = this.benchmarkCache;
    if (c && c.sessions >= sessions && Date.now() - c.at < BENCHMARK_TTL_MS) return c.closes;
    const candles = await this.market.stockHistory('VNINDEX', sessions);
    const closes = new Map(candles.map((x) => [vnDateKey(new Date(x.time * 1000)), x.close]));
    this.benchmarkCache = { at: Date.now(), sessions, closes };
    return closes;
  }
}

function lock(db: Db, userId: string) {
  return db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`practice:${userId}`}))`;
}

function assertStartCash(startCash: number) {
  if (!(START_CASH_OPTIONS as readonly number[]).includes(startCash)) {
    throw new BadRequestException(
      `Số tiền ban đầu phải là một trong: ${START_CASH_OPTIONS.map((n) => n.toLocaleString('vi-VN')).join(', ')} ₫`,
    );
  }
}

function toRecord(t: PaperTrade): TradeRecord {
  return {
    assetType: t.assetType as PracticeAssetType,
    symbol: t.symbol,
    side: t.side as PracticeSide,
    quantity: roundQty(num(t.quantity)),
    price: num(t.price),
    fee: num(t.fee),
    tax: num(t.tax),
  };
}

function serializeTrade(t: PaperTrade, realizedPnl: number | null): PracticeTrade {
  const side = t.side as PracticeSide;
  const quantity = roundQty(num(t.quantity));
  const price = num(t.price);
  const fee = num(t.fee);
  const tax = num(t.tax);
  const gross = Math.round(quantity * price);
  return {
    id: t.id,
    assetType: t.assetType as PracticeAssetType,
    symbol: t.symbol,
    label: label(t.assetType, t.symbol),
    side,
    quantity,
    price,
    fee,
    tax,
    gross,
    net: side === 'buy' ? gross + fee : gross - fee - tax,
    cashAfter: num(t.cashAfter),
    executedAt: t.executedAt.toISOString(),
    realizedPnl,
  };
}
