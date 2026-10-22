import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PlanReview as PlanReviewRow, Transaction as TransactionRow } from '@prisma/client';
import type {
  AssetType,
  Currency,
  JournalEmotion,
  JournalEntry,
  JournalMonth,
  JournalMonthSummary,
  JournalPlanEditEntry,
  JournalPlanRef,
  JournalReason,
  JournalReviewEntry,
  JournalReviewTagRequest,
  JournalTagRequest,
  JournalTradeEntry,
  JournalTxType,
  PlanDecision,
  TrackedAssetType,
} from '@dautu/contracts';
import { NotifierService } from '../alerts/notifier.service';
import { vnDateKey } from '../market/types';
import { PlansService } from '../plans/plans.module';
import { PrismaService } from '../prisma/prisma.module';
import {
  isJournalTxType,
  levelCheck,
  levelsOn,
  monthLabel,
  monthRange,
  monthTotals,
  PLAN_LINK_TX_TYPES,
  priceSincePct,
  shiftMonth,
  summarize,
  type PlanLevels,
  type PlanVersionLite,
  type SummaryInput,
} from './journal-logic';
import { journalColumns } from './journal-tags';

/** Tối đa số mục mỗi loại trong dòng thời gian một tháng (đủ cho nhà đầu tư cá nhân; quá thì báo bị cắt) */
export const ENTRY_LIMIT = 300;
/** Tổng kết cần đếm đủ: trần cao hơn chỉ để chặn trường hợp bất thường */
const SUMMARY_LIMIT = 5000;

export interface JournalFilter {
  emotion?: JournalEmotion;
  planId?: string;
}

interface PlanInfo {
  ref: JournalPlanRef;
  assetType: string;
  symbol: string;
  createdDate: string;
  current: PlanLevels;
  versions: PlanVersionLite[];
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal | null) => d?.toNumber() ?? null;

/**
 * Nhật ký quyết định (FREE-08). Không có bảng nhật ký riêng: đọc nhãn trên giao dịch (Transaction), lần xem lại
 * (PlanReview) và lần sửa kế hoạch (PlanVersion) — nhật ký là một cách nhìn lại dữ liệu đã có.
 * Không bao giờ suy ra giao dịch từ nội dung trò chuyện với cố vấn: chỉ những gì người dùng tự ghi trong sổ.
 */
@Injectable()
export class JournalService {
  private log = new Logger(JournalService.name);

  constructor(
    private prisma: PrismaService,
    private plans: PlansService,
    private notifier: NotifierService,
  ) {}

  /** Dòng thời gian một tháng, mới nhất trước; lọc theo cảm xúc và / hoặc kế hoạch */
  async month(userId: string, month: string, filter: JournalFilter = {}): Promise<JournalMonth> {
    const plans = await this.planIndex(userId);
    if (filter.planId && !plans.has(filter.planId)) throw new NotFoundException('Không tìm thấy kế hoạch');
    const rows = await this.load(userId, month, filter, ENTRY_LIMIT + 1);
    const truncated =
      rows.txs.length > ENTRY_LIMIT || rows.reviews.length > ENTRY_LIMIT || rows.edits.length > ENTRY_LIMIT;
    const entries: JournalEntry[] = [
      ...rows.txs.slice(0, ENTRY_LIMIT).map((t) => this.tradeEntry(t, plans, true)),
      ...rows.reviews.slice(0, ENTRY_LIMIT).flatMap((r) => {
        const plan = plans.get(r.planId);
        return plan ? [reviewEntry(r, plan.ref)] : [];
      }),
      ...rows.edits.slice(0, ENTRY_LIMIT).flatMap((v): JournalPlanEditEntry[] => {
        const plan = plans.get(v.planId);
        return plan
          ? [
              {
                kind: 'plan_edit',
                id: v.id,
                date: vnDateKey(v.createdAt),
                createdAt: v.createdAt.toISOString(),
                plan: plan.ref,
              },
            ]
          : [];
      }),
    ];
    entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
    return { month, entries, plans: [...plans.values()].map((p) => p.ref), truncated };
  }

  /** Kế hoạch của người dùng (đang theo dõi trước), gọn: để lọc nhật ký và gắn giao dịch */
  async planRefs(userId: string): Promise<JournalPlanRef[]> {
    return [...(await this.planIndex(userId)).values()].map((p) => p.ref);
  }

  /** Tổng kết tháng + số liệu gọn của tháng trước để so */
  async summary(userId: string, month: string): Promise<JournalMonthSummary> {
    const plans = await this.planIndex(userId);
    const [cur, prev] = await Promise.all([
      this.load(userId, month, {}, SUMMARY_LIMIT),
      this.load(userId, shiftMonth(month, -1), {}, SUMMARY_LIMIT),
    ]);
    const input = (m: string, rows: Awaited<ReturnType<JournalService['load']>>, prices: boolean): SummaryInput => ({
      month: m,
      trades: rows.txs.map((t) => {
        const e = this.tradeEntry(t, plans, prices);
        return { ...e, linked: e.plan !== null };
      }),
      reviews: rows.reviews.map((r) => ({
        decision: r.decision as PlanDecision,
        reason: r.reason as JournalReason | null,
        emotion: r.emotion as JournalEmotion | null,
      })),
      edits: rows.edits.length,
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
    const cols = await journalColumns(this.prisma, userId, { ...t, current: t }, dto);
    const row = Object.keys(cols).length ? await this.prisma.transaction.update({ where: { id }, data: cols }) : t;
    return this.tradeEntry(row, await this.planIndex(userId), true);
  }

  /** Gắn / đổi / xoá nhãn của một lần xem lại kế hoạch đã ghi */
  async tagReview(userId: string, id: string, dto: JournalReviewTagRequest): Promise<JournalReviewEntry> {
    const r = await this.prisma.planReview.findFirst({ where: { id, plan: { userId } } });
    if (!r) throw new NotFoundException('Không tìm thấy lần xem lại');
    const data: Prisma.PlanReviewUpdateInput = {};
    if (dto.reason !== undefined) data.reason = dto.reason;
    if (dto.emotion !== undefined) data.emotion = dto.emotion;
    const row = Object.keys(data).length ? await this.prisma.planReview.update({ where: { id }, data }) : r;
    const plan = (await this.planIndex(userId)).get(row.planId)!;
    return reviewEntry(row, plan.ref);
  }

  /**
   * Ngày 1 hằng tháng (worker/scheduled-jobs.ts): mời người đã ghi nhật ký tháng trước xem tổng kết. Mỗi người mỗi tháng
   * một lần (dedupeKey). Chỉ gửi cho ai có nhãn / liên kết kế hoạch / lần xem lại trong tháng; Telegram / Web Push
   * mặc định tắt loại tin này (channel-rules.ts).
   */
  async monthlyDigest(now = new Date()) {
    const month = shiftMonth(vnDateKey(now).slice(0, 7), -1);
    const r = monthRange(month);
    const [fromTx, fromReviews] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          deletedAt: null,
          date: { gte: new Date(`${r.fromDate}T00:00:00Z`), lt: new Date(`${r.toDate}T00:00:00Z`) },
          OR: [{ reason: { not: null } }, { emotion: { not: null } }, { planId: { not: null } }],
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.investmentPlan.findMany({
        where: { reviews: { some: { createdAt: { gte: r.fromTs, lt: r.toTs } } } },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);
    const users = new Set([...fromTx, ...fromReviews].map((u) => u.userId));
    let sent = 0;
    for (const userId of users) {
      const n = await this.notifier.send(userId, {
        kind: 'journal_monthly',
        severity: 'info',
        title: `Tổng kết thói quen ${monthLabel(month)}`,
        body: 'Nhìn lại các quyết định tháng trước: lần nào theo kế hoạch, lần nào theo cảm xúc lúc đó. Không có đúng sai, chỉ để bạn tự nhận ra thói quen của mình.',
        dedupeKey: `journal:${month}`,
        link: `/journal?month=${month}`,
      });
      if (n) sent++;
    }
    if (sent) this.log.log(`Mời xem tổng kết nhật ký ${month}: ${sent} người`);
    return { month, sent };
  }

  // ---------- nội bộ ----------

  private async planIndex(userId: string) {
    const rows = await this.prisma.investmentPlan.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        assetType: true,
        symbol: true,
        status: true,
        targetPrice: true,
        stopPrice: true,
        createdAt: true,
        versions: { select: { createdAt: true, snapshot: true } },
      },
    });
    return new Map<string, PlanInfo>(
      rows.map((p) => [
        p.id,
        {
          ref: {
            id: p.id,
            assetType: p.assetType as TrackedAssetType,
            symbol: p.symbol,
            displayName: this.plans.displayName(p.assetType, p.symbol),
            status: p.status as 'active' | 'closed',
          },
          assetType: p.assetType,
          symbol: p.symbol,
          createdDate: vnDateKey(p.createdAt),
          current: { targetPrice: p.targetPrice, stopPrice: p.stopPrice },
          versions: p.versions.map((v) => ({ date: vnDateKey(v.createdAt), snapshot: v.snapshot })),
        },
      ]),
    );
  }

  /** Mua / bán trong tháng (mọi lệnh, có nhãn hay chưa) + nạp / rút có nhãn; lần xem lại; lần sửa kế hoạch */
  private async load(userId: string, month: string, filter: JournalFilter, limit: number) {
    const r = monthRange(month);
    const byPlan = filter.planId ? { planId: filter.planId } : {};
    const byEmotion = filter.emotion ? { emotion: filter.emotion } : {};
    const tagged: Prisma.TransactionWhereInput[] = [{ reason: { not: null } }, { emotion: { not: null } }];
    const [txs, reviews, edits] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          date: { gte: new Date(`${r.fromDate}T00:00:00Z`), lt: new Date(`${r.toDate}T00:00:00Z`) },
          OR: [{ type: { in: ['buy', 'sell'] } }, { type: { in: ['deposit', 'withdraw'] }, OR: tagged }],
          ...byPlan,
          ...byEmotion,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.planReview.findMany({
        where: { plan: { userId }, createdAt: { gte: r.fromTs, lt: r.toTs }, ...byPlan, ...byEmotion },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      // Lần sửa kế hoạch không có nhãn cảm xúc: lọc theo cảm xúc thì bỏ
      filter.emotion
        ? Promise.resolve([])
        : this.prisma.planVersion.findMany({
            where: { plan: { userId }, createdAt: { gte: r.fromTs, lt: r.toTs }, ...byPlan },
            orderBy: { createdAt: 'desc' },
            select: { id: true, planId: true, createdAt: true },
            take: limit,
          }),
    ]);
    return { txs, reviews, edits };
  }

  /** Dòng Prisma → mục nhật ký, dựng từng trường; mốc kế hoạch lấy theo phiên bản có hiệu lực ngày giao dịch */
  private tradeEntry(t: TransactionRow, plans: Map<string, PlanInfo>, withPrices: boolean): JournalTradeEntry {
    const date = dateKey(t.date);
    const type = t.type as JournalTxType;
    const price = num(t.price);
    const plan = t.planId ? (plans.get(t.planId) ?? null) : null;
    const trade = (PLAN_LINK_TX_TYPES as readonly string[]).includes(type);
    const asset =
      t.assetType && t.assetType !== 'cash' && t.symbol ? { assetType: t.assetType, symbol: t.symbol } : null;
    let since: number | null = null;
    if (withPrices && trade && asset) {
      const now = this.plans.priceNative(asset.assetType, asset.symbol);
      since = now.status === 'missing' ? null : priceSincePct(price, now.value);
    }
    return {
      kind: 'trade',
      id: t.id,
      date,
      createdAt: t.createdAt.toISOString(),
      type,
      assetType: t.assetType as AssetType | null,
      symbol: t.symbol,
      displayName: asset ? this.plans.displayName(asset.assetType, asset.symbol) : t.symbol,
      quantity: num(t.quantity),
      price,
      amount: num(t.amount),
      currency: t.currency as Currency,
      note: t.note,
      reason: t.reason as JournalReason | null,
      emotion: t.emotion as JournalEmotion | null,
      plan: plan?.ref ?? null,
      levelCheck: plan && trade ? levelCheck(price, levelsOn(plan.current, plan.versions, date)) : null,
      beforePlan: plan ? date < plan.createdDate : false,
      priceSincePct: since,
    };
  }
}

function reviewEntry(r: PlanReviewRow, plan: JournalPlanRef): JournalReviewEntry {
  return {
    kind: 'review',
    id: r.id,
    date: vnDateKey(r.createdAt),
    createdAt: r.createdAt.toISOString(),
    decision: r.decision as PlanDecision,
    note: r.note,
    reason: r.reason as JournalReason | null,
    emotion: r.emotion as JournalEmotion | null,
    plan,
    pnlPctAtReview: r.pnlPctAtReview,
  };
}
