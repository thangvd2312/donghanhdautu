import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { InvestmentPlan, Prisma } from '@prisma/client';
import type { Currency, Plan, PlanDetail, PlanListItem, PlanReview, TxType } from '@dautu/contracts';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PlanAsset, PlanDto, ReviewDto } from './dto/plan.dto';
import { PlanAssetsService } from './plan-assets.service';
import { addDays, DEFAULT_REVIEW_DAYS, distancePct, planSignals } from './plan-rules';
import { presentReview, presentVersion, snapshot, toPlan, toPlanLite } from './plans.presenter';

/** Investment plans: create, edit (versioned), review (keep / adjust / close) and the list / detail views. */
@Injectable()
export class PlansService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private assets: PlanAssetsService,
    private analytics: AnalyticsService,
  ) {}

  /** `before`: kế hoạch đang sửa — không gửi ngày xem lại và không đổi chu kỳ thì giữ nguyên ngày cũ (kể cả đã quá hạn) */
  private fields(dto: PlanDto, today: string, before?: InvestmentPlan) {
    const every = dto.reviewEveryDays ?? null;
    const keep = before && !dto.nextReviewAt && every === before.reviewEveryDays;
    const next = keep
      ? before.nextReviewAt.toISOString().slice(0, 10)
      : (dto.nextReviewAt ?? addDays(today, every ?? DEFAULT_REVIEW_DAYS));
    if (!keep && next < today) throw new BadRequestException('Ngày xem lại phải từ hôm nay trở đi');
    if (dto.targetPrice != null && dto.stopPrice != null && dto.stopPrice >= dto.targetPrice) {
      throw new BadRequestException('Mốc cắt lỗ phải thấp hơn mốc chốt lời');
    }
    return {
      thesis: dto.thesis.trim(),
      horizon: dto.horizon?.trim() || null,
      exitConditions: dto.exitConditions.trim(),
      targetPrice: dto.targetPrice ?? null,
      stopPrice: dto.stopPrice ?? null,
      reviewEveryDays: every,
      nextReviewAt: new Date(`${next}T00:00:00Z`),
    };
  }

  async list(userId: string): Promise<PlanListItem[]> {
    const plans = await this.prisma.investmentPlan.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { nextReviewAt: 'asc' }],
      include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const v = await this.portfolio.valuation(userId);
    const today = vnDateKey();
    return plans.map((p) => {
      const price = this.assets.priceNative(p.assetType, p.symbol);
      const held = v.holdings.find((h) => h.assetType === p.assetType && h.symbol === p.symbol);
      return {
        ...this.present(p),
        price,
        held: held ? { quantity: held.quantity, pnlPct: held.pnlPct } : null,
        signals: p.status === 'active' ? planSignals(toPlanLite(p), today, price.value) : [],
        lastReview: p.reviews[0] ? presentReview(p.reviews[0]) : null,
      };
    });
  }

  async detail(userId: string, id: string): Promise<PlanDetail> {
    const p = await this.prisma.investmentPlan.findFirst({
      where: { id, userId },
      include: { versions: { orderBy: { createdAt: 'desc' } }, reviews: { orderBy: { createdAt: 'desc' } } },
    });
    if (!p) throw new NotFoundException('Không tìm thấy kế hoạch');
    const [v, profile, txs] = await Promise.all([
      this.portfolio.valuation(userId),
      this.prisma.investorProfile.findUnique({ where: { userId }, select: { maxDrawdownPct: true } }),
      this.prisma.transaction.findMany({
        where: { userId, deletedAt: null, assetType: p.assetType, symbol: p.symbol },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const price = this.assets.priceNative(p.assetType, p.symbol);
    const held = v.holdings.find((h) => h.assetType === p.assetType && h.symbol === p.symbol);
    // Cùng mã có thể có nhiều kế hoạch nối tiếp: giao dịch thuộc kế hoạch này là giao dịch trong khoảng
    // từ ngày lập tới ngày kết thúc (giờ VN); giao dịch ngoài khoảng vẫn hiện để đối chiếu nhưng được ghi rõ
    const from = vnDateKey(p.createdAt);
    const to = p.closedAt ? vnDateKey(p.closedAt) : null;
    const period = (date: string) => (date < from ? 'before' : to && date > to ? 'after' : 'during');
    return {
      ...this.present(p),
      price,
      dayChangePct: this.market.dayChangePct(p.assetType as PlanAsset, p.symbol),
      held: held
        ? {
            quantity: held.quantity,
            avgCost: held.avgCost,
            pnlPct: held.pnlPct,
            pnl: held.pnl,
            weightPct: held.weightPct,
            exceedsMaxLoss: profile && held.pnlPct !== null ? held.pnlPct <= -profile.maxDrawdownPct : null,
          }
        : null,
      maxDrawdownPct: profile?.maxDrawdownPct ?? null,
      toTargetPct: distancePct(price.value, p.targetPrice),
      toStopPct: distancePct(price.value, p.stopPrice),
      signals: p.status === 'active' ? planSignals(toPlanLite(p), vnDateKey(), price.value) : [],
      versions: p.versions.map(presentVersion),
      reviews: p.reviews.map(presentReview),
      transactions: txs.map((t) => ({
        id: t.id,
        type: t.type as TxType,
        date: t.date.toISOString().slice(0, 10),
        quantity: t.quantity?.toNumber() ?? null,
        price: t.price?.toNumber() ?? null,
        amount: t.amount?.toNumber() ?? null,
        currency: t.currency as Currency,
        period: period(t.date.toISOString().slice(0, 10)),
        linked: t.planId === p.id,
        emotion: t.emotion as PlanDetail['transactions'][number]['emotion'],
      })),
    };
  }

  async create(userId: string, dto: PlanDto): Promise<Plan> {
    const symbol = await this.assets.normalize(dto.assetType, dto.symbol);
    const data = this.fields(dto, vnDateKey());
    // Kiểm tra trùng và ghi dưới cùng khoá theo người dùng: hai yêu cầu đồng thời không tạo hai kế hoạch đang theo dõi
    const plan = await this.prisma.$transaction(async (db) => {
      await lockPlans(db, userId);
      const existing = await db.investmentPlan.findFirst({
        where: { userId, assetType: dto.assetType, symbol, status: 'active' },
      });
      if (existing) {
        throw new ConflictException({ message: 'Tài sản này đã có kế hoạch đang theo dõi', planId: existing.id });
      }
      return db.investmentPlan.create({ data: { userId, assetType: dto.assetType, symbol, ...data } });
    });
    void this.analytics.track('plan_created', { userId });
    return this.present(plan);
  }

  /** Sửa kế hoạch: lưu bản trước vào lịch sử */
  async update(userId: string, id: string, dto: PlanDto): Promise<Plan> {
    await this.own(userId, id);
    const plan = await this.prisma.$transaction(async (db) => {
      await lockPlans(db, userId);
      const before = await db.investmentPlan.findUniqueOrThrow({ where: { id } });
      if (before.status !== 'active') throw new BadRequestException('Kế hoạch đã kết thúc, không sửa được');
      const data = this.fields(dto, vnDateKey(), before);
      await db.planVersion.create({ data: { planId: id, snapshot: snapshot(before) } });
      return db.investmentPlan.update({ where: { id }, data });
    });
    return this.present(plan);
  }

  /** Ghi một lần xem lại: giữ / điều chỉnh (đặt ngày xem lại mới) / kết thúc kế hoạch */
  async review(userId: string, id: string, dto: ReviewDto): Promise<PlanReview> {
    const plan = await this.own(userId, id);
    if (plan.status !== 'active') throw new BadRequestException('Kế hoạch đã kết thúc');
    const today = vnDateKey();
    const price = this.assets.priceNative(plan.assetType, plan.symbol);
    const v = await this.portfolio.valuation(userId);
    const held = v.holdings.find((h) => h.assetType === plan.assetType && h.symbol === plan.symbol);
    const next = dto.nextReviewAt ?? addDays(today, plan.reviewEveryDays ?? DEFAULT_REVIEW_DAYS);
    if (dto.decision !== 'close' && next <= today)
      throw new BadRequestException('Ngày xem lại tiếp theo phải sau hôm nay');
    const saved = await this.prisma.$transaction(async (db) => {
      // Đọc lại trạng thái dưới khoá: hai lần kết thúc / xem lại đồng thời không cùng được ghi
      await lockPlans(db, userId);
      const current = await db.investmentPlan.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (current.status !== 'active') throw new BadRequestException('Kế hoạch đã kết thúc');
      const review = await db.planReview.create({
        data: {
          planId: id,
          decision: dto.decision,
          note: dto.note?.trim() || null,
          priceAtReview: price.value,
          pnlPctAtReview: held?.pnlPct ?? null,
          reason: dto.reason ?? null,
          emotion: dto.emotion ?? null,
        },
      });
      await db.investmentPlan.update({
        where: { id },
        data:
          dto.decision === 'close'
            ? { status: 'closed', closedAt: new Date(), closedReason: dto.note?.trim() || null }
            : { nextReviewAt: new Date(`${next}T00:00:00Z`) },
      });
      return review;
    });
    void this.analytics.track('plan_reviewed', { userId, props: { decision: dto.decision } });
    return presentReview(saved);
  }

  private async own(userId: string, id: string) {
    const p = await this.prisma.investmentPlan.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy kế hoạch');
    return p;
  }

  private present(p: InvestmentPlan): Plan {
    return toPlan(p, this.assets.displayName(p.assetType, p.symbol));
  }
}

function lockPlans(db: Prisma.TransactionClient, userId: string) {
  return db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plans:${userId}`}))`;
}
