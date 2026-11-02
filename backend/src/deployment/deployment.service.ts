import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  DeployEtf,
  DeployHorizon,
  DeployMix,
  DeploymentPreview,
  DeploymentSetup,
  RiskType,
} from '@dautu/contracts';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TransactionsService } from '../portfolio/transactions.service';
import { vnd } from '../portfolio/analysis/rebalance.math';
import { riskLabel, PARTS } from './deployment.mix';
import { horizonFor, planDeployment, type PlanPrices } from './deployment.plan';
import type { DeploymentDto } from './dto/deployment.dto';

const ETFS: DeployEtf[] = ['E1VFVN30', 'FUEVFVND'];
const NO_PROFILE = 'Làm bài khảo sát khẩu vị rủi ro trước để app biết mức rủi ro hợp với bạn';

type Answers = Record<string, string | undefined>;
const answersOf = (v: unknown): Answers => (v && typeof v === 'object' ? (v as Answers) : {});

/** Kế hoạch giải ngân: gom hồ sơ, danh mục, giá rồi gọi tầng quy tắc (deployment.plan.ts). Xem trước không ghi gì. */
@Injectable()
export class DeploymentService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private transactions: TransactionsService,
  ) {}

  /** Dữ liệu điền sẵn: hồ sơ, tiền mặt đang ghi, mục tiêu, giá ETF */
  async setup(userId: string): Promise<DeploymentSetup> {
    const [profile, v, goals, etfOptions] = await Promise.all([
      this.prisma.investorProfile.findUnique({ where: { userId } }),
      this.portfolio.valuation(userId),
      this.prisma.goal.findMany({ where: { userId, status: 'active' }, orderBy: { targetDate: 'asc' } }),
      this.etfOptions(),
    ]);
    const a = answersOf(profile?.answers);
    return {
      profile: profile && {
        riskType: profile.riskType as RiskType,
        riskLabel: riskLabel(profile.riskType as RiskType),
        horizon: profile.horizon as DeployHorizon,
        maxDrawdownPct: profile.maxDrawdownPct,
        fomoProne: profile.fomoProne,
        emergency: a.emergency === 'yes' || a.emergency === 'no' ? a.emergency : null,
        margin: a.margin === 'never' || a.margin === 'sometimes' || a.margin === 'often' ? a.margin : null,
      },
      cashVnd: Math.round(this.cashVnd(v.holdings)),
      holdingsTotal: Math.round(v.totalValue),
      goals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        targetDate: g.targetDate.toISOString().slice(0, 10),
        targetAmount: g.targetAmount,
      })),
      etfOptions,
      activePlanId: null,
    };
  }

  async preview(userId: string, dto: DeploymentDto): Promise<DeploymentPreview> {
    const profile = await this.prisma.investorProfile.findUnique({ where: { userId } });
    if (!profile) throw new BadRequestException(NO_PROFILE);
    const portfolioId = dto.portfolioId || undefined;
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, userId, portfolioId);

    const today = vnDateKey();
    if (dto.needBy && dto.needBy <= today) throw new BadRequestException('Ngày cần dùng tiền phải sau hôm nay');
    if (dto.mix) {
      const total = PARTS.reduce((s, p) => s + dto.mix![p], 0);
      if (total !== 100) throw new BadRequestException(`Tổng tỷ trọng phải bằng 100% (hiện ${total}%)`);
    }
    const mode = dto.mode;
    const fromCash = mode === 'one_time' && !!dto.fromCash;

    const v = await this.portfolio.valuation(userId, portfolioId);
    const cash = this.cashVnd(v.holdings);
    if (fromCash && dto.amount > cash + 0.5) {
      throw new BadRequestException(
        `Số tiền lớn hơn tiền mặt VND đang ghi trong danh mục (${vnd(cash)} ₫). Bỏ chọn "đã ghi là tiền mặt" nếu đây là tiền mới.`,
      );
    }
    const etf = dto.etf ?? 'E1VFVN30';
    const { current, notes } = await this.currentByPart(v.holdings);
    const a = answersOf(profile.answers);

    return planDeployment({
      req: {
        amount: dto.amount,
        mode,
        horizon: dto.needBy ? horizonFor(dto.needBy, today) : dto.horizon,
        needBy: dto.needBy ?? null,
        fromCash,
        tranches: dto.tranches ?? 3,
        etf,
        mix: dto.mix ?? null,
        emergency: dto.emergency ?? null,
        highInterestDebt: dto.highInterestDebt ?? null,
        marginDebt: dto.marginDebt ?? null,
      },
      profile: {
        riskType: profile.riskType as RiskType,
        maxDrawdownPct: profile.maxDrawdownPct,
        fomoProne: profile.fomoProne,
        experience: a.experience ?? null,
        incomeShare: a.income_share ?? null,
      },
      current,
      prices: await this.prices(etf),
      today,
      asOf: v.generatedAt,
      notes,
    });
  }

  private cashVnd(holdings: { assetType: string; symbol: string; marketValue: number | null; costValue: number }[]) {
    return holdings
      .filter((h) => h.assetType === 'cash' && h.symbol === 'VND')
      .reduce((s, h) => s + (h.marketValue ?? h.costValue), 0);
  }

  /** Quy tài sản đang giữ về 5 phần: tiền mặt → tiền gửi, cổ phiếu loại ETF → ETF, cổ phiếu khác → tự chọn */
  private async currentByPart(
    holdings: { assetType: string; symbol: string; marketValue: number | null; costValue: number }[],
  ) {
    const current: DeployMix = { savings: 0, gold: 0, etf: 0, picks: 0, crypto: 0 };
    const notes: string[] = [];
    const types = new Map(
      await Promise.all(
        holdings
          .filter((h) => h.assetType === 'stock')
          .map(
            async (h) =>
              [
                h.symbol,
                await this.market.assertStock(h.symbol).then(
                  (i) => i.type,
                  () => null,
                ),
              ] as const,
          ),
      ),
    );
    let unpriced = false;
    for (const h of holdings) {
      const value = h.marketValue ?? h.costValue;
      if (h.marketValue === null) unpriced = true;
      if (h.assetType === 'cash') current.savings += value;
      else if (h.assetType === 'gold') current.gold += value;
      else if (h.assetType === 'crypto') current.crypto += value;
      else if (h.assetType === 'stock') current[types.get(h.symbol) === 'ETF' ? 'etf' : 'picks'] += value;
    }
    if (holdings.some((h) => h.assetType === 'cash' && h.symbol === 'USDT')) {
      notes.push('Tiền mặt USDT được tính vào phần tiền gửi.');
    }
    if (unpriced) notes.push('Tài sản chưa lấy được giá được tính theo giá vốn.');
    return { current, notes };
  }

  /** Giá ETF, sản phẩm vàng có chênh lệch mua–bán thấp nhất, BTC/ETH (VND) lúc lập */
  private async prices(etf: DeployEtf): Promise<PlanPrices> {
    await this.market.stockQuote(etf).catch(() => null);
    const gold = this.market
      .goldQuotes()
      .filter((g) => g.currency === 'VND' && g.buy > 0 && g.sell > g.buy)
      .sort((x, y) => (x.sell - x.buy) / x.sell - (y.sell - y.buy) / y.sell || x.code.localeCompare(y.code))[0];
    return {
      etf: this.market.priceInfo('stock', etf).value,
      gold: gold ? { code: gold.code, name: gold.name, buy: gold.buy, sell: gold.sell } : null,
      btc: this.market.priceInfo('crypto', 'BTCUSDT').value,
      eth: this.market.priceInfo('crypto', 'ETHUSDT').value,
    };
  }

  private etfOptions(): Promise<DeploymentSetup['etfOptions']> {
    return Promise.all(
      ETFS.map(async (symbol) => {
        const info = await this.market.assertStock(symbol).catch(() => null);
        await this.market.stockQuote(symbol).catch(() => null);
        return { symbol, name: info?.name ?? symbol, price: this.market.priceInfo('stock', symbol).value };
      }),
    );
  }
}
