import { Injectable } from '@nestjs/common';
import type { RiskType } from '@dautu/contracts';
import { ETF_SYMBOLS } from '../deployment/deployment.mix';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { attributeGoals } from './goal-attribution';
import type { AttributionTx } from './goal-attribution';
import { goalTargetMix } from './goal-plan';
import { toPlanGoal } from './goals.presenter';
import type { GoalsContext } from './goals.presenter';
import type { AdviceProfile } from './return-plan';

type Answers = Record<string, string | undefined>;
const answersOf = (v: unknown): Answers => (v && typeof v === 'object' ? (v as Answers) : {});

/**
 * Gom một lần mọi thứ trang Mục tiêu cần: mục tiêu, danh mục đã định giá, hồ sơ rủi ro, sổ giao dịch (để chia tài sản
 * cho từng mục tiêu), các tháng góp tiền. Chỉ đọc, không ghi gì.
 */
@Injectable()
export class GoalsContextService {
  constructor(
    private prisma: PrismaService,
    private portfolio: PortfolioService,
  ) {}

  async profile(userId: string): Promise<AdviceProfile | null> {
    const p = await this.prisma.investorProfile.findUnique({ where: { userId } });
    if (!p) return null;
    const a = answersOf(p.answers);
    return {
      riskType: p.riskType as RiskType,
      maxDrawdownPct: p.maxDrawdownPct,
      fomoProne: p.fomoProne,
      experience: a.experience ?? null,
      incomeShare: a.income_share ?? null,
    };
  }

  async load(userId: string): Promise<GoalsContext> {
    const [rows, valuation, profile, txRows, contributions] = await Promise.all([
      this.prisma.goal.findMany({ where: { userId }, orderBy: [{ status: 'asc' }, { targetDate: 'asc' }] }),
      this.portfolio.valuation(userId),
      this.profile(userId),
      this.prisma.transaction.findMany({
        where: { userId, deletedAt: null },
        select: {
          type: true,
          assetType: true,
          symbol: true,
          quantity: true,
          price: true,
          amount: true,
          fee: true,
          tax: true,
          currency: true,
          fxRate: true,
          goalId: true,
          reason: true,
        },
      }),
      this.prisma.goalContribution.findMany({ where: { userId }, orderBy: { month: 'asc' } }),
    ]);
    const today = vnDateKey();
    const goals = rows.map(toPlanGoal);
    const num = (d: { toNumber(): number } | null) => (d ? d.toNumber() : null);
    const txs: AttributionTx[] = txRows.map((t) => ({
      type: t.type,
      assetType: t.assetType,
      symbol: t.symbol,
      quantity: num(t.quantity),
      price: num(t.price),
      amount: num(t.amount),
      fee: t.fee.toNumber(),
      tax: t.tax.toNumber(),
      currency: t.currency,
      fxRate: num(t.fxRate),
      goalId: t.goalId,
    }));
    const attribution = attributeGoals(txs, valuation.holdings, goals, {
      etfSymbols: ETF_SYMBOLS,
      usdtVnd: valuation.usdtVnd,
    });
    const buys: GoalsContextBuys = {};
    for (const t of txRows) {
      if (t.type === 'buy' && t.goalId) (buys[t.goalId] ??= []).push({ reason: t.reason });
    }
    return {
      rows,
      goals,
      today,
      valuation,
      profile,
      attribution,
      targetMix: Object.fromEntries(goals.map((g) => [g.id, goalTargetMix(g, profile, today)])),
      contributions,
      buys,
    };
  }
}

type GoalsContextBuys = GoalsContext['buys'];
