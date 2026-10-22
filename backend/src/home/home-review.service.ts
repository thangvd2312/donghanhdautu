import { Injectable } from '@nestjs/common';
import type { PortfolioAlertKind, ReviewPoint } from '@dautu/contracts';
import { MarketService } from '../market/market.service';
import { nativePrice } from '../market/native-price';
import { vnDateKey } from '../market/types';
import { CorporateActionsService } from '../portfolio/dividends/corporate-actions.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { mergeReviewPoints } from '../portfolio-alerts/review-merge';
import { parseCheck, toConfig } from '../portfolio-alerts/rule-row';
import { corporateActionReviewPoints, planReviewPoints, sortBySeverity } from './review-points';
import { reviewPoints } from './today';

/**
 * The "needs a look" list: default portfolio checks, price targets, plan signals, unrecorded rights events, then the
 * user's own portfolio-alert thresholds layered on top so the page agrees with their notifications.
 */
@Injectable()
export class HomeReviewService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private corporateActions: CorporateActionsService,
  ) {}

  async review(userId: string): Promise<ReviewPoint[]> {
    const [v, profile, alerts, plans, actions] = await Promise.all([
      this.portfolio.valuation(userId),
      this.prisma.investorProfile.findUnique({ where: { userId }, select: { riskType: true, maxDrawdownPct: true } }),
      this.prisma.priceAlert.findMany({ where: { userId, active: true } }),
      this.prisma.investmentPlan.findMany({ where: { userId, status: 'active' } }),
      // Nguồn sự kiện lỗi thì bỏ qua điểm này, không làm hỏng cả khối
      this.corporateActions.missing(userId).catch(() => null),
    ]);
    const points = reviewPoints(
      v,
      profile,
      alerts.map((a) => ({ ...a, currentPrice: nativePrice(this.market, a.assetType, a.symbol, 'sell') })),
    );
    const today = vnDateKey();
    const planPoints = planReviewPoints(plans, today, (type, symbol) => nativePrice(this.market, type, symbol, 'buy'));
    const actionPoints = corporateActionReviewPoints(actions);
    const all = sortBySeverity([...points, ...planPoints, ...actionPoints]);
    // Cảnh báo danh mục người dùng đã bật: dùng ngưỡng / mục tiêu của họ thay cho mốc mặc định, khớp với thông báo
    const rules = await this.prisma.portfolioAlertRule.findMany({ where: { userId, enabled: true } });
    if (!rules.length) return all;
    const drawdown = rules.find((r) => r.kind === 'drawdown');
    return mergeReviewPoints(
      all,
      v,
      rules.map((r) => toConfig(r.kind as PortfolioAlertKind, r)),
      drawdown ? parseCheck(drawdown.lastCheck) : null,
      new Date(),
    );
  }
}
