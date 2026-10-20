import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvestmentPlan, Prisma } from '@prisma/client';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AlertsModule } from '../alerts/alerts.module';
import { LlmService } from '../alerts/llm.service';
import { NotifierService } from '../alerts/notifier.service';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService, normalizeCrypto } from '../market/market.service';
import { VN_TZ, vnDateKey } from '../market/types';
import { PortfolioModule, PortfolioService } from '../portfolio/portfolio.module';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.module';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import { addDays, DEFAULT_REVIEW_DAYS, displaySymbol, distancePct, planSignals } from './plan-rules';

const PLAN_ASSETS = ['stock', 'crypto', 'gold'] as const;
type PlanAsset = (typeof PLAN_ASSETS)[number];

class PlanDto {
  @IsIn(PLAN_ASSETS) assetType!: PlanAsset;
  @IsString() @MaxLength(20) symbol!: string;
  @IsString()
  @MinLength(5, { message: 'Hãy viết lý do mua / nắm giữ (ít nhất vài chữ)' })
  @MaxLength(3000)
  thesis!: string;
  @IsOptional() @IsString() @MaxLength(100) horizon?: string;
  @IsString()
  @MinLength(5, { message: 'Hãy viết điều kiện để xem lại hoặc bán' })
  @MaxLength(3000)
  exitConditions!: string;
  @IsOptional() @IsNumber() @Min(0) targetPrice?: number | null;
  @IsOptional() @IsNumber() @Min(0) stopPrice?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(730) reviewEveryDays?: number | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) nextReviewAt?: string;
}

class ReviewDto {
  @IsIn(['keep', 'adjust', 'close']) decision!: 'keep' | 'adjust' | 'close';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) nextReviewAt?: string;
}

class DraftDto {
  @IsIn(PLAN_ASSETS) assetType!: PlanAsset;
  @IsString() @MaxLength(20) symbol!: string;
}

interface PlanDraft {
  thesis: string;
  horizon: string;
  exitConditions: string;
  reviewEveryDays: number;
  targetPrice: number | null;
  stopPrice: number | null;
  caveat: string;
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['thesis', 'horizon', 'exitConditions', 'reviewEveryDays', 'targetPrice', 'stopPrice', 'caveat'],
  properties: {
    thesis: { type: 'string' },
    horizon: { type: 'string' },
    exitConditions: { type: 'string' },
    reviewEveryDays: { type: 'integer' },
    targetPrice: { type: ['number', 'null'] },
    stopPrice: { type: ['number', 'null'] },
    caveat: { type: 'string' },
  },
};

const DRAFT_PROMPT = `Bạn giúp một nhà đầu tư cá nhân người Việt viết BẢN NHÁP kế hoạch đầu tư cho một tài sản. Người dùng sẽ tự sửa và tự quyết định lưu; bạn không quyết định thay họ.

Viết bằng tiếng Việt, ngôi thứ nhất của người dùng ("Tôi mua vì..."), ngắn gọn, cụ thể, kiểm chứng được:
- thesis: 2–4 câu, lý do nắm giữ dựa trên dữ liệu được cung cấp (định giá, kết quả kinh doanh, xu hướng). Không bịa số liệu; chỉ dùng số có trong dữ liệu. Nếu dữ liệu ít, viết luận điểm dạng câu hỏi để người dùng tự điền.
- horizon: thời gian dự định nắm giữ, hợp với khung thời gian trong hồ sơ.
- exitConditions: 2–4 điều kiện cho thấy luận điểm sai hoặc cần xem lại (vd lợi nhuận giảm 2 quý liên tiếp, giá thủng MA200, lỗ vượt mức chịu được). Mỗi điều kiện một dòng bắt đầu bằng "- ".
- reviewEveryDays: chu kỳ xem lại hợp lý (cổ phiếu thường 30–90 ngày theo mùa báo cáo; crypto ngắn hơn).
- stopPrice: nếu có giá vốn hoặc giá hiện tại và mức lỗ tối đa chịu được, đề xuất mốc cắt lỗ = giá vốn (hoặc giá hiện tại nếu chưa mua) × (1 − maxDrawdownPct/100), làm tròn hợp lý; không có thì null.
- targetPrice: chỉ đề xuất khi dữ liệu định giá cho căn cứ rõ; không thì null.
- caveat: 1 câu nêu điều cần người dùng tự kiểm chứng thêm.
Đơn vị giá: cổ phiếu VND/cp, coin USDT, vàng VND/lượng (giá mua vào). Không khuyến nghị mua/bán; đây là khung kế hoạch để người dùng giữ kỷ luật.`;

@Injectable()
export class PlansService {
  private log = new Logger(PlansService.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private llm: LlmService,
    private notifier: NotifierService,
    private analytics: AnalyticsService,
  ) {}

  /** Giá hiện tại theo đơn vị của kế hoạch: VND/cp, USDT/coin, VND/lượng (giá mua vào) */
  priceNative(assetType: string, symbol: string) {
    const info = this.market.priceInfo(assetType as PlanAsset, symbol);
    const value =
      info.value === null ? null : assetType === 'crypto' ? info.value / this.market.usdtVnd.rate : info.value;
    return { value, status: info.status, source: info.source, asOf: info.asOf };
  }

  private async normalizeAsset(assetType: PlanAsset, raw: string) {
    let symbol = raw.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Chọn tài sản');
    if (assetType === 'stock') {
      symbol = (await this.market.assertStock(symbol)).symbol;
      await this.market.stockQuote(symbol).catch(() => null);
    }
    if (assetType === 'crypto') {
      symbol = normalizeCrypto(symbol);
      if (!this.market.binance.quotes.has(symbol)) throw new NotFoundException(`Không có cặp ${symbol} trên Binance`);
    }
    if (assetType === 'gold' && !this.market.goldQuotes().some((g) => g.code === symbol)) {
      throw new NotFoundException(`Không có loại vàng ${symbol}`);
    }
    return symbol;
  }

  private displayName(assetType: string, symbol: string) {
    if (assetType === 'gold') return this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol;
    return displaySymbol(assetType, symbol);
  }

  private fields(dto: PlanDto, today: string) {
    const every = dto.reviewEveryDays ?? null;
    const next = dto.nextReviewAt ?? addDays(today, every ?? DEFAULT_REVIEW_DAYS);
    if (next < today) throw new BadRequestException('Ngày xem lại phải từ hôm nay trở đi');
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

  async list(userId: string) {
    const plans = await this.prisma.investmentPlan.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { nextReviewAt: 'asc' }],
      include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const v = await this.portfolio.valuation(userId);
    const today = vnDateKey();
    return plans.map((p) => {
      const price = this.priceNative(p.assetType, p.symbol);
      const held = v.holdings.find((h) => h.assetType === p.assetType && h.symbol === p.symbol);
      return {
        ...this.present(p),
        price,
        held: held ? { quantity: held.quantity, pnlPct: held.pnlPct } : null,
        signals: p.status === 'active' ? planSignals(this.lite(p), today, price.value) : [],
        lastReview: p.reviews[0] ?? null,
      };
    });
  }

  async detail(userId: string, id: string) {
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
    const price = this.priceNative(p.assetType, p.symbol);
    const held = v.holdings.find((h) => h.assetType === p.assetType && h.symbol === p.symbol);
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
      signals: p.status === 'active' ? planSignals(this.lite(p), vnDateKey(), price.value) : [],
      versions: p.versions,
      reviews: p.reviews,
      transactions: txs.map((t) => ({
        id: t.id,
        type: t.type,
        date: t.date.toISOString().slice(0, 10),
        quantity: t.quantity?.toNumber() ?? null,
        price: t.price?.toNumber() ?? null,
        amount: t.amount?.toNumber() ?? null,
        currency: t.currency,
      })),
    };
  }

  async create(userId: string, dto: PlanDto) {
    const symbol = await this.normalizeAsset(dto.assetType, dto.symbol);
    const existing = await this.prisma.investmentPlan.findFirst({
      where: { userId, assetType: dto.assetType, symbol, status: 'active' },
    });
    if (existing) {
      throw new ConflictException({ message: 'Tài sản này đã có kế hoạch đang theo dõi', planId: existing.id });
    }
    const plan = await this.prisma.investmentPlan.create({
      data: { userId, assetType: dto.assetType, symbol, ...this.fields(dto, vnDateKey()) },
    });
    void this.analytics.track('plan_created', { userId });
    return this.present(plan);
  }

  /** Sửa kế hoạch: lưu bản trước vào lịch sử */
  async update(userId: string, id: string, dto: PlanDto) {
    const before = await this.own(userId, id);
    if (before.status !== 'active') throw new BadRequestException('Kế hoạch đã kết thúc, không sửa được');
    const data = this.fields(dto, vnDateKey());
    const plan = await this.prisma.$transaction(async (db) => {
      await db.planVersion.create({ data: { planId: id, snapshot: snapshot(before) } });
      return db.investmentPlan.update({ where: { id }, data });
    });
    return this.present(plan);
  }

  /** Ghi một lần xem lại: giữ / điều chỉnh (đặt ngày xem lại mới) / kết thúc kế hoạch */
  async review(userId: string, id: string, dto: ReviewDto) {
    const plan = await this.own(userId, id);
    if (plan.status !== 'active') throw new BadRequestException('Kế hoạch đã kết thúc');
    const today = vnDateKey();
    const price = this.priceNative(plan.assetType, plan.symbol);
    const v = await this.portfolio.valuation(userId);
    const held = v.holdings.find((h) => h.assetType === plan.assetType && h.symbol === plan.symbol);
    const next = dto.nextReviewAt ?? addDays(today, plan.reviewEveryDays ?? DEFAULT_REVIEW_DAYS);
    if (dto.decision !== 'close' && next <= today)
      throw new BadRequestException('Ngày xem lại tiếp theo phải sau hôm nay');
    const saved = await this.prisma.$transaction(async (db) => {
      const review = await db.planReview.create({
        data: {
          planId: id,
          decision: dto.decision,
          note: dto.note?.trim() || null,
          priceAtReview: price.value,
          pnlPctAtReview: held?.pnlPct ?? null,
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
    return saved;
  }

  /** AI viết nháp kế hoạch từ hồ sơ, vị thế đang có và dữ liệu thị trường; không lưu gì */
  async draft(userId: string, dto: DraftDto) {
    if (!this.llm.enabled) throw new ServiceUnavailableException('Trợ lý AI đang tắt, bạn có thể tự viết kế hoạch');
    const symbol = await this.normalizeAsset(dto.assetType, dto.symbol);
    const [profile, v] = await Promise.all([
      this.prisma.investorProfile.findUnique({ where: { userId } }),
      this.portfolio.valuation(userId),
    ]);
    const held = v.holdings.find((h) => h.assetType === dto.assetType && h.symbol === symbol);
    const price = this.priceNative(dto.assetType, symbol);
    let market: unknown = { price };
    if (dto.assetType === 'stock') {
      const d = await this.market.stockDetail(symbol).catch(() => null);
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
      system: DRAFT_PROMPT,
      user: JSON.stringify({
        asset: { type: dto.assetType, symbol: this.displayName(dto.assetType, symbol) },
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

  /** 8:00 mỗi ngày: nhắc các kế hoạch đến hạn xem lại (mỗi ngày xem lại chỉ nhắc một lần) */
  @Cron('0 8 * * *', { timeZone: VN_TZ })
  async remindDue() {
    const today = vnDateKey();
    const due = await this.prisma.investmentPlan.findMany({
      where: { status: 'active', nextReviewAt: { lte: new Date(`${today}T00:00:00Z`) } },
    });
    for (const p of due) {
      const reviewDate = p.nextReviewAt.toISOString().slice(0, 10);
      if (p.remindedFor && p.remindedFor.toISOString().slice(0, 10) === reviewDate) continue;
      const name = this.displayName(p.assetType, p.symbol);
      await this.notifier.send(p.userId, {
        kind: 'plan_review',
        severity: 'info',
        title: `Đến hạn xem lại kế hoạch ${name}`,
        body: 'Luận điểm ban đầu còn đúng không? Mở kế hoạch để đối chiếu với dữ liệu hiện tại rồi chọn giữ, điều chỉnh hay kết thúc.',
        dedupeKey: `plan:${p.id}:${reviewDate}`,
        link: `/plans/${p.id}`,
      });
      await this.prisma.investmentPlan.update({ where: { id: p.id }, data: { remindedFor: p.nextReviewAt } });
    }
    if (due.length) this.log.log(`Nhắc xem lại ${due.length} kế hoạch`);
  }

  private async own(userId: string, id: string) {
    const p = await this.prisma.investmentPlan.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy kế hoạch');
    return p;
  }

  private lite(p: InvestmentPlan) {
    return { ...p, nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10) };
  }

  private present(p: InvestmentPlan) {
    return {
      id: p.id,
      assetType: p.assetType as PlanAsset,
      symbol: p.symbol,
      displayName: this.displayName(p.assetType, p.symbol),
      link:
        p.assetType === 'stock'
          ? `/stock/${p.symbol}`
          : p.assetType === 'crypto'
            ? `/crypto/${displaySymbol('crypto', p.symbol)}`
            : null,
      currency: p.assetType === 'crypto' ? 'USDT' : 'VND',
      thesis: p.thesis,
      horizon: p.horizon,
      exitConditions: p.exitConditions,
      targetPrice: p.targetPrice,
      stopPrice: p.stopPrice,
      reviewEveryDays: p.reviewEveryDays,
      nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10),
      status: p.status as 'active' | 'closed',
      closedReason: p.closedReason,
      closedAt: p.closedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

function snapshot(p: InvestmentPlan): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(p)) as Prisma.InputJsonValue;
}

@UseGuards(JwtAuthGuard)
@Controller('plans')
class PlansController {
  constructor(private plans: PlansService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.plans.list(user.id);
  }

  @Post('draft')
  draft(@CurrentUser() user: AuthUser, @Body() dto: DraftDto) {
    return this.plans.draft(user.id, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plans.detail(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: PlanDto) {
    return this.plans.create(user.id, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanDto) {
    return this.plans.update(user.id, id, dto);
  }

  @Post(':id/reviews')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.plans.review(user.id, id, dto);
  }
}

@Module({
  imports: [MarketModule, PortfolioModule, AlertsModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
