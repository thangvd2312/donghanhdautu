import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PlanDraft } from '@dautu/contracts';
import { LlmService } from '../alerts/llm.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { StockResearchService } from '../market/stock-research.service';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import type { DraftDto } from './dto/plan.dto';
import { PlanAssetsService } from './plan-assets.service';
import { DRAFT_PROMPT, DRAFT_SCHEMA } from './plan-draft.prompt';
import { DEFAULT_REVIEW_DAYS } from './plan-rules';

/** AI-written plan draft from the user's profile, current position and market data; saves nothing. */
@Injectable()
export class PlanDraftService {
  constructor(
    private prisma: PrismaService,
    private research: StockResearchService,
    private portfolio: PortfolioService,
    private llm: LlmService,
    private aiUsage: AiUsageService,
    private assets: PlanAssetsService,
  ) {}

  /** AI viết nháp kế hoạch từ hồ sơ, vị thế đang có và dữ liệu thị trường; không lưu gì */
  async draft(userId: string, dto: DraftDto): Promise<PlanDraft> {
    if (!this.llm.enabled) throw new ServiceUnavailableException('Trợ lý AI đang tắt, bạn có thể tự viết kế hoạch');
    return this.aiUsage.run(userId, 'plan_draft', () => this.writeDraft(userId, dto));
  }

  private async writeDraft(userId: string, dto: DraftDto) {
    const symbol = await this.assets.normalize(dto.assetType, dto.symbol);
    const [profile, v] = await Promise.all([
      this.prisma.investorProfile.findUnique({ where: { userId } }),
      this.portfolio.valuation(userId),
    ]);
    const held = v.holdings.find((h) => h.assetType === dto.assetType && h.symbol === symbol);
    const price = this.assets.priceNative(dto.assetType, symbol);
    let market: unknown = { price };
    if (dto.assetType === 'stock') {
      const d = await this.research.stockDetail(symbol).catch(() => null);
      if (d) {
        market = {
          price,
          name: d.company?.name ?? d.quote.name,
          sector: (d.company as { sector?: string } | null)?.sector,
          latestRatios: d.ratios.at(-1) ?? null,
          technicals: d.technicals,
        };
      }
    }
    const draft = await this.llm.json<PlanDraft>({
      tier: 'fast',
      feature: 'plan_draft',
      userId,
      system: DRAFT_PROMPT,
      user: JSON.stringify({
        asset: { type: dto.assetType, symbol: this.assets.displayName(dto.assetType, symbol) },
        investor: profile
          ? {
              type: RISK_TYPE_LABEL[profile.riskType],
              goal: profile.goal,
              horizon: profile.horizon,
              maxDrawdownPct: profile.maxDrawdownPct,
              fomoProne: profile.fomoProne,
            }
          : 'chưa khảo sát',
        position: held
          ? { quantity: held.quantity, avgCost: held.avgCost, pnlPct: held.pnlPct, weightPct: held.weightPct }
          : 'chưa nắm giữ (đang cân nhắc / theo dõi)',
        market,
        today: vnDateKey(),
      }),
      schema: DRAFT_SCHEMA,
      maxTokens: 2000,
    });
    if (!draft) throw new ServiceUnavailableException('AI chưa viết được bản nháp, bạn thử lại hoặc tự viết nhé');
    return {
      ...draft,
      reviewEveryDays: Math.min(365, Math.max(7, Math.round(draft.reviewEveryDays || DEFAULT_REVIEW_DAYS))),
    };
  }
}
