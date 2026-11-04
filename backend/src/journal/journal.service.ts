import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Transaction as TransactionRow } from '@prisma/client';
import type {
  AssetType,
  Currency,
  JournalEmotion,
  JournalMonth,
  JournalMonthSummary,
  JournalReason,
  JournalTagRequest,
  JournalTradeEntry,
  JournalTxType,
} from '@dautu/contracts';
import { NotifierService } from '../alerts/notifier.service';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  isJournalTxType,
  monthLabel,
  monthRange,
  monthTotals,
  priceSincePct,
  shiftMonth,
  summarize,
  TRADE_TX_TYPES,
  type SummaryInput,
} from './journal-logic';
import { journalColumns } from './journal-tags';

/** Tối đa số mục mỗi loại trong dòng thời gian một tháng (đủ cho nhà đầu tư cá nhân; quá thì báo bị cắt) */
const ENTRY_LIMIT = 300;
/** Tổng kết cần đếm đủ: trần cao hơn chỉ để chặn trường hợp bất thường */
const SUMMARY_LIMIT = 5000;

interface JournalFilter {
  emotion?: JournalEmotion;
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal | null) => d?.toNumber() ?? null;

/**
 * Nhật ký quyết định (FREE-08). Không có bảng nhật ký riêng: đọc nhãn lý do / cảm xúc trên giao dịch (Transaction) —
 * nhật ký là một cách nhìn lại dữ liệu đã có.
 * Không bao giờ suy ra giao dịch từ nội dung trò chuyện với cố vấn: chỉ những gì người dùng tự ghi trong sổ.
 */
@Injectable()
export class JournalService {
  private log = new Logger(JournalService.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private notifier: NotifierService,
  ) {}

  /** Dòng thời gian một tháng, mới nhất trước; lọc theo cảm xúc */
  async month(userId: string, month: string, filter: JournalFilter = {}): Promise<JournalMonth> {
    const txs = await this.load(userId, month, filter, ENTRY_LIMIT + 1);
    return {
      month,
      entries: txs.slice(0, ENTRY_LIMIT).map((t) => this.tradeEntry(t, true)),
      truncated: txs.length > ENTRY_LIMIT,
    };
  }

  /** Tổng kết tháng + số liệu gọn của tháng trước để so */
  async summary(userId: string, month: string): Promise<JournalMonthSummary> {
    const [cur, prev] = await Promise.all([
      this.load(userId, month, {}, SUMMARY_LIMIT),
      this.load(userId, shiftMonth(month, -1), {}, SUMMARY_LIMIT),
    ]);
    const input = (m: string, rows: TransactionRow[], prices: boolean): SummaryInput => ({
      month: m,
      trades: rows.map((t) => this.tradeEntry(t, prices)),
    });
    const previous = monthTotals(input(shiftMonth(month, -1), prev, false));
    return summarize(input(month, cur, true), previous);
  }

  /** Gắn / đổi / xoá nhãn của một giao dịch đã ghi. Chỉ đổi cột nhật ký, không chạm số liệu trong sổ */
  async tagTransaction(userId: string, id: string, dto: JournalTagRequest): Promise<JournalTradeEntry> {
    const t = await this.prisma.transaction.findFirst({ where: { id, userId, deletedAt: null } });
    if (!t) throw new NotFoundException('Không tìm thấy giao dịch');
    if (!isJournalTxType(t.type)) {
      throw new BadRequestException('Chỉ gắn nhãn nhật ký cho giao dịch mua, bán, nạp hoặc rút tiền');
    }
    const cols = journalColumns({ ...t, current: t }, dto);
    const row = Object.keys(cols).length ? await this.prisma.transaction.update({ where: { id }, data: cols }) : t;
    return this.tradeEntry(row, true);
  }

  /**
   * Ngày 1 hằng tháng (worker/scheduled-jobs.ts): mời người đã ghi nhật ký tháng trước xem tổng kết. Mỗi người mỗi tháng
   * một lần (dedupeKey). Chỉ gửi cho ai có nhãn lý do / cảm xúc trong tháng; Telegram / Web Push
   * mặc định tắt loại tin này (channel-rules.ts).
   */
  async monthlyDigest(now = new Date()) {
    const month = shiftMonth(vnDateKey(now).slice(0, 7), -1);
    const r = monthRange(month);
    const users = await this.prisma.transaction.findMany({
      where: {
        deletedAt: null,
        date: { gte: new Date(`${r.fromDate}T00:00:00Z`), lt: new Date(`${r.toDate}T00:00:00Z`) },
        OR: [{ reason: { not: null } }, { emotion: { not: null } }],
      },
      distinct: ['userId'],
      select: { userId: true },
    });
    let sent = 0;
    for (const { userId } of users) {
      const n = await this.notifier.send(userId, {
        kind: 'journal_monthly',
        severity: 'info',
        title: `Tổng kết thói quen ${monthLabel(month)}`,
        body: 'Nhìn lại các quyết định tháng trước: vì sao mua / bán và cảm xúc lúc đó. Không có đúng sai, chỉ để bạn tự nhận ra thói quen của mình.',
        dedupeKey: `journal:${month}`,
        link: `/journal?month=${month}`,
      });
      if (n) sent++;
    }
    if (sent) this.log.log(`Mời xem tổng kết nhật ký ${month}: ${sent} người`);
    return { month, sent };
  }

  // ---------- nội bộ ----------

  /** Mua / bán trong tháng (mọi lệnh, có nhãn hay chưa) + nạp / rút có nhãn */
  private load(userId: string, month: string, filter: JournalFilter, limit: number) {
    const r = monthRange(month);
    const byEmotion = filter.emotion ? { emotion: filter.emotion } : {};
    const tagged: Prisma.TransactionWhereInput[] = [{ reason: { not: null } }, { emotion: { not: null } }];
    return this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: new Date(`${r.fromDate}T00:00:00Z`), lt: new Date(`${r.toDate}T00:00:00Z`) },
        OR: [{ type: { in: ['buy', 'sell'] } }, { type: { in: ['deposit', 'withdraw'] }, OR: tagged }],
        ...byEmotion,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  /** Giá hiện tại theo đơn vị gốc của giao dịch: VND/cp, USDT/coin, VND/lượng (giá mua vào) */
  private priceNative(assetType: string, symbol: string) {
    const info = this.market.priceInfo(assetType as AssetType, symbol);
    if (info.status === 'missing' || info.value === null) return null;
    return assetType === 'crypto' ? info.value / this.market.usdtVnd.rate : info.value;
  }

  private displayName(assetType: string, symbol: string) {
    if (assetType === 'gold') return this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol;
    return assetType === 'crypto' ? symbol.replace(/USDT$/, '') : symbol;
  }

  /** Dòng Prisma → mục nhật ký, dựng từng trường */
  private tradeEntry(t: TransactionRow, withPrices: boolean): JournalTradeEntry {
    const type = t.type as JournalTxType;
    const price = num(t.price);
    const trade = (TRADE_TX_TYPES as readonly string[]).includes(type);
    const asset =
      t.assetType && t.assetType !== 'cash' && t.symbol ? { assetType: t.assetType, symbol: t.symbol } : null;
    const since =
      withPrices && trade && asset ? priceSincePct(price, this.priceNative(asset.assetType, asset.symbol)) : null;
    return {
      kind: 'trade',
      id: t.id,
      date: dateKey(t.date),
      createdAt: t.createdAt.toISOString(),
      type,
      assetType: t.assetType as AssetType | null,
      symbol: t.symbol,
      displayName: asset ? this.displayName(asset.assetType, asset.symbol) : t.symbol,
      quantity: num(t.quantity),
      price,
      amount: num(t.amount),
      currency: t.currency as Currency,
      note: t.note,
      reason: t.reason as JournalReason | null,
      emotion: t.emotion as JournalEmotion | null,
      priceSincePct: since,
    };
  }
}
