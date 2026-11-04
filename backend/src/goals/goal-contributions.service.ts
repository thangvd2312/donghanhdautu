import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ContributionPreview, DeployMix, GoalContributionPlan, GoalContributionView } from '@dautu/contracts';
import { ETF_SYMBOLS, PART_LABEL } from '../deployment/deployment.mix';
import { MarketService } from '../market/market.service';
import { PrismaService } from '../prisma/prisma.service';
import { routeContribution, splitAcrossGoals } from './goal-contribution';
import type { Instruments, MinUnit, SplitGoal } from './goal-contribution';
import { requiredMonthly, monthsUntil } from './goal-math';
import { GoalsContextService } from './goals-context.service';
import { toContributionView } from './goals.presenter';
import type { GoalsContext } from './goals.presenter';
import { expectedOf, SAVINGS_ONLY } from './return-plan';

const NO_PROFILE = 'Làm bài khảo sát khẩu vị rủi ro trước để app biết chia tiền góp vào đâu';
const day = (key: string) => new Date(`${key}T00:00:00Z`);

/**
 * Thẻ "Tháng này góp tiền vào đâu" (docs/DESIGN_GOALS_V3.md §4.2, §4.3): chia khoản góp chung cho các mục tiêu đang
 * chạy theo mức ưu tiên, rồi chia phần của từng mục tiêu vào các phần đang thiếu. Xem trước không ghi gì; app không
 * tự ghi giao dịch, người dùng bấm "Đã mua" từng dòng.
 */
@Injectable()
export class GoalContributionsService {
  constructor(
    private prisma: PrismaService,
    private context: GoalsContextService,
    private market: MarketService,
  ) {}

  async preview(userId: string, amount: number): Promise<ContributionPreview> {
    const ctx = await this.context.load(userId);
    return { month: this.monthOf(ctx), amount, perGoal: this.plan(ctx, amount) };
  }

  /** Lưu tháng này (planned); tháng đã có thì lập lại, trừ khi đã làm xong */
  async save(userId: string, amount: number): Promise<GoalContributionView> {
    const ctx = await this.context.load(userId);
    const month = day(this.monthOf(ctx));
    const existing = ctx.contributions.find((c) => c.month.getTime() === month.getTime());
    if (existing?.status === 'done') throw new BadRequestException('Tháng này đã góp xong');
    const data = {
      amount,
      split: this.plan(ctx, amount) as unknown as Prisma.InputJsonValue,
      status: 'planned',
      skipReason: null,
      doneAt: null,
    };
    const row = await this.prisma.goalContribution.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, ...data },
      update: data,
    });
    return toContributionView(row);
  }

  async done(userId: string, id: string): Promise<GoalContributionView> {
    await this.own(userId, id);
    const row = await this.prisma.goalContribution.update({
      where: { id },
      data: { status: 'done', doneAt: new Date(), skipReason: null },
    });
    return toContributionView(row);
  }

  async skip(userId: string, id: string, reason: string): Promise<GoalContributionView> {
    if (!reason.trim()) throw new BadRequestException('Ghi lý do bỏ qua tháng này');
    await this.own(userId, id);
    const row = await this.prisma.goalContribution.update({
      where: { id },
      data: { status: 'skipped', doneAt: new Date(), skipReason: reason.trim() },
    });
    return toContributionView(row);
  }

  private monthOf(ctx: GoalsContext) {
    return `${ctx.today.slice(0, 7)}-01`;
  }

  private async own(userId: string, id: string) {
    const c = await this.prisma.goalContribution.findFirst({ where: { id, userId } });
    if (!c) throw new NotFoundException('Không tìm thấy tháng góp tiền này');
    return c;
  }

  /** Chia `amount` cho các mục tiêu đang chạy rồi cho từng phần của mỗi mục tiêu */
  private plan(ctx: GoalsContext, amount: number): GoalContributionPlan[] {
    const active = ctx.goals.filter((g) => g.status === 'active');
    if (!active.length) throw new BadRequestException('Chưa có mục tiêu đang chạy để góp tiền');
    if (active.some((g) => !ctx.targetMix[g.id])) throw new BadRequestException(NO_PROFILE);

    const needs: SplitGoal[] = active.map((g) => {
      const share = ctx.attribution.byGoal[g.id];
      const mix = ctx.targetMix[g.id]!;
      const rate = expectedOf(mix ?? SAVINGS_ONLY)?.mid ?? 0;
      const need =
        g.kind === 'return'
          ? g.monthlyContribution
          : requiredMonthly(share.value, g.targetAmount, rate, monthsUntil(ctx.today, g.targetDate));
      return { id: g.id, kind: g.kind, priority: g.priority, requiredMonthly: need };
    });
    const { minUnit, instruments } = this.instruments(ctx);
    return splitAcrossGoals(amount, needs).map((s) => {
      const goal = active.find((g) => g.id === s.id)!;
      const current: DeployMix = ctx.attribution.byGoal[s.id].byPart;
      return {
        goalId: s.id,
        goalName: goal.name,
        amount: s.amount,
        shortfall: s.shortfall,
        lines: routeContribution(s.amount, current, ctx.targetMix[s.id]!, minUnit, instruments),
      };
    });
  }

  /**
   * Mua gì cho từng phần: ETF đang giữ (không có thì ETF đầu tiên trong danh sách của Giải ngân), vàng có chênh lệch
   * mua–bán thấp nhất, BTC. Vàng mua tối thiểu 1 chỉ (1/10 lượng) theo giá bán ra hiện tại.
   */
  private instruments(ctx: GoalsContext): { minUnit: MinUnit; instruments: Instruments } {
    const held = new Set(ctx.valuation.holdings.filter((h) => h.assetType === 'stock').map((h) => h.symbol));
    const etf = ETF_SYMBOLS.find((s) => held.has(s)) ?? ETF_SYMBOLS[0];
    const gold = this.market
      .goldQuotes()
      .filter((g) => g.currency === 'VND' && g.buy > 0 && g.sell > g.buy)
      .sort((x, y) => (x.sell - x.buy) / x.sell - (y.sell - y.buy) / y.sell || x.code.localeCompare(y.code))[0];
    return {
      minUnit: gold ? { gold: gold.sell / 10 } : {},
      instruments: {
        savings: { label: PART_LABEL.savings, assetType: 'cash', symbol: 'VND' },
        gold: gold
          ? { label: `Vàng · ${gold.name}`, assetType: 'gold', symbol: gold.code }
          : { label: PART_LABEL.gold, assetType: 'gold', symbol: null },
        etf: { label: `ETF ${etf}`, assetType: 'stock', symbol: etf },
        picks: { label: PART_LABEL.picks, assetType: 'stock', symbol: null },
        crypto: { label: 'BTC', assetType: 'crypto', symbol: 'BTCUSDT' },
      },
    };
  }
}
