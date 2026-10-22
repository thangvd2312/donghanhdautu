import { Injectable } from '@nestjs/common';
import { MarketService } from '../market/market.service';
import { StockResearchService } from '../market/stock-research.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { REFERENCE_ALLOCATION, RISK_TYPE_LABEL } from '../profile/quiz';
import { round, text } from './tool-format';

/**
 * The data each advisor tool hands to the AI: the user's profile and portfolio, a market overview, gold, one stock,
 * a comparison. Pure data gathering; the tool registry (`AdvisorTools`) owns names, schemas and execution.
 */
@Injectable()
export class AdvisorToolData {
  constructor(
    private market: MarketService,
    private research: StockResearchService,
    private portfolio: PortfolioService,
    private prisma: PrismaService,
  ) {}

  async myPortfolio(userId: string) {
    const [profile, valuation, user, performance, plans, goals] = await Promise.all([
      this.prisma.investorProfile.findUnique({ where: { userId } }),
      this.portfolio.valuation(userId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
      this.portfolio.performance(userId).catch(() => null),
      this.prisma.investmentPlan.findMany({ where: { userId, status: 'active' } }),
      this.prisma.goal.findMany({ where: { userId, status: 'active' }, include: { allocations: true } }),
    ]);
    const accounts = await this.portfolio.listPortfolios(userId).catch(() => []);
    return {
      name: user.name,
      profile: profile
        ? {
            riskType: `${profile.riskType} (${RISK_TYPE_LABEL[profile.riskType]})`,
            riskScore: profile.riskScore,
            goal: profile.goal,
            horizon: profile.horizon,
            maxDrawdownPct: profile.maxDrawdownPct,
            fomoProne: profile.fomoProne,
            answers: profile.answers,
            referenceAllocationPct: REFERENCE_ALLOCATION[profile.riskType],
          }
        : 'Người dùng chưa làm khảo sát khẩu vị rủi ro: KHÔNG tự giả định mức chịu rủi ro, mục tiêu hay khung thời gian. Câu hỏi cần cá nhân hoá thì trả lời ở mức nguyên tắc chung, nói rõ là chưa biết khẩu vị của họ và mời làm khảo sát ngắn ở /onboarding.',
      portfolio: valuation.holdings.length
        ? {
            ...valuation,
            // Tính sẵn để AI không tự so sánh số (đã thấy model nói "gần ngưỡng" khi đã vượt)
            holdings: valuation.holdings.map((h) => ({
              ...h,
              exceedsYourMaxLoss: profile && h.pnlPct !== null ? h.pnlPct <= -profile.maxDrawdownPct : null,
            })),
          }
        : 'Người dùng chưa khai báo tài sản nắm giữ',
      // Từ sổ giao dịch: totalProfit = giá trị hiện tại − vốn đưa vào ròng (tiền nạp không phải lãi);
      // realized = lãi đã chốt khi bán, unrealized = lãi/lỗ chưa chốt của tài sản đang giữ
      performance: performance ?? 'Chưa tính được hiệu quả từ sổ giao dịch',
      // Kế hoạch người dùng TỰ ĐẶT: đối chiếu lời khuyên với luận điểm và điều kiện của họ
      investmentPlans: plans.length
        ? plans.map((p) => ({
            asset: p.assetType === 'crypto' ? p.symbol.replace(/USDT$/, '') : p.symbol,
            assetType: p.assetType,
            thesis: p.thesis,
            horizon: p.horizon,
            exitConditions: p.exitConditions,
            targetPrice: p.targetPrice,
            stopPrice: p.stopPrice,
            nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10),
          }))
        : 'Chưa có kế hoạch nào',
      // Mục tiêu tài chính người dùng tự đặt; expectedReturnPct là GIẢ ĐỊNH của họ, không phải dự báo
      // Các danh mục / tài khoản riêng (số liệu phía trên là gộp tất cả)
      accounts:
        accounts.length > 1
          ? accounts.map((a) => ({ name: a.name, totalValueVnd: Math.round(a.totalValue) }))
          : undefined,
      financialGoals: goals.length
        ? goals.map((g) => ({
            name: g.name,
            targetAmountVnd: g.targetAmount,
            targetDate: g.targetDate.toISOString().slice(0, 10),
            monthlyContributionVnd: g.monthlyContribution,
            assumedAnnualReturnPct: g.expectedReturnPct,
            targetAllocationPct: g.targetAllocation,
            assignedAssets: g.allocations.map((a) => ({ asset: a.symbol.replace(/USDT$/, ''), pctOfHolding: a.pct })),
          }))
        : 'Chưa đặt mục tiêu tài chính',
    };
  }

  overview() {
    const s = this.market.snapshot();
    const sorted = [...s.stocks].sort((a, b) => b.changePct - a.changePct);
    const slim = (q: (typeof s.stocks)[number]) => ({
      symbol: q.symbol,
      price: q.price,
      changePct: round(q.changePct),
      valueBn: round(q.valueBn),
      foreignNetVol: q.foreignBuyVol - q.foreignSellVol,
    });
    return {
      source:
        'Vietcap (cổ phiếu), Binance (crypto), vang.today (vàng), Vietcombank (tỷ giá USD), Binance P2P (USDT/VND)',
      // Độ mới thật của dữ liệu theo từng nguồn (lần lấy thành công/lỗi gần nhất), không phải giờ tạo phản hồi
      dataSources: s.sources,
      stockSessionOpen: s.stockSessionOpen,
      indices: s.indices,
      vn30: {
        symbols: s.stocks.map((q) => q.symbol),
        topGainers: sorted.slice(0, 5).map(slim),
        topLosers: sorted.slice(-5).reverse().map(slim),
        mostTraded: [...s.stocks]
          .sort((a, b) => b.valueBn - a.valueBn)
          .slice(0, 5)
          .map(slim),
      },
      gold: this.gold(),
      crypto: s.crypto
        .slice(0, 8)
        .map((c) => ({ symbol: c.base, priceUsd: c.price, change24hPct: round(c.changePct) })),
      fx: s.fx,
      usdtVnd: s.usdt ?? 'không lấy được tỷ giá P2P',
    };
  }

  gold() {
    const quotes = this.market.goldQuotes();
    const world = this.market.worldGoldVndPerLuong();
    const sjc = quotes.find((g) => g.code === 'SJL1L10');
    return {
      source: 'vang.today (tổng hợp SJC, DOJI, PNJ, Bảo Tín Minh Châu); quy đổi theo tỷ giá Vietcombank',
      unit: 'VND/lượng (XAUUSD: USD/oz)',
      quotes: quotes.map((g) => ({ ...g, spread: g.sell && g.buy ? g.sell - g.buy : null })),
      worldGoldVndPerLuong: world,
      sjcPremiumVsWorld:
        sjc && world ? { vnd: sjc.sell - world, pct: round(((sjc.sell - world) / world) * 100) } : null,
      usdVnd: this.market.usdVndInfo,
    };
  }

  async stock(symbol: string) {
    const d = await this.research.stockDetail(symbol);
    const f = await this.research.stockFundamentals(symbol, d.quote.price);
    // Chuỗi từng quý chỉ để vẽ biểu đồ — cố vấn dùng thống kê đã tính sẵn
    const valuationHistory = f.valuationHistory ? { ...f.valuationHistory, series: undefined } : null;
    return {
      source: 'Vietcap (giá, hồ sơ, BCTC, chỉ số, cổ đông, giao dịch nội bộ), chỉ báo kỹ thuật tính từ nến ngày',
      ...d,
      ...f,
      valuationHistory,
    };
  }

  async compare(symbols: string[]) {
    const rows = await Promise.all(
      symbols.map(async (s) => {
        try {
          const d = await this.research.stockDetail(s);
          const vh = await this.research.valuationHistory(s, d.quote.price).catch(() => null);
          const lastRatio = d.ratios.at(-1) ?? {};
          const years = d.income?.years ?? [];
          const profitKey = (row?: Record<string, unknown>) =>
            row ? Object.keys(row).find((k) => /Cổ đông của Công ty mẹ|Lợi nhuận của Cổ đông/.test(k)) : undefined;
          const ly = years.at(-1);
          const py = years.at(-2);
          const k = profitKey(ly);
          const growth =
            ly && py && k && typeof ly[k] === 'number' && typeof py[k] === 'number' && py[k]
              ? round(((Number(ly[k]) - Number(py[k])) / Math.abs(Number(py[k]))) * 100)
              : null;
          const t: Record<string, unknown> = { ...d.technicals };
          return {
            symbol: d.quote.symbol,
            sector: d.company?.sector,
            price: d.quote.price,
            changePct: round(d.quote.changePct),
            marketCapBn: d.company?.marketCapBn,
            ratiosPeriod: lastRatio.period,
            pe: lastRatio.pe,
            pb: lastRatio.pb,
            peNow: vh?.current.pe ?? null,
            peHistoryMedian: vh?.pe?.median ?? null,
            pePercentileInOwnHistory: vh?.pe && 'currentPercentile' in vh.pe ? vh.pe.currentPercentile : null,
            pbPercentileInOwnHistory: vh?.pb && 'currentPercentile' in vh.pb ? vh.pb.currentPercentile : null,
            valuationHistoryPeriod: vh?.period ?? null,
            roe: lastRatio.roe,
            netMargin: lastRatio.afterTaxProfitMargin,
            liabilitiesToEquity: lastRatio.liabilitiesToEquity,
            nim: lastRatio.netInterestMargin,
            npl: lastRatio.npl,
            profitGrowthLastYearPct: growth,
            profitGrowthPeriod: ly && py ? `${py.period}→${ly.period}` : null,
            trend: t.trend,
            rsi14: t.rsi14,
            return3mPct: (t.returnPct as Record<string, number> | undefined)?.['3m'],
            return1yPct: (t.returnPct as Record<string, number> | undefined)?.['1y'],
            fromHigh52wPct: t.fromHigh52wPct,
            vietcapRating: d.company?.analystView
              ? `${text(d.company.analystView.rating)} @ ${text(d.company.analystView.targetPrice)} (${text(d.company.analystView.ratingAsOf)})`
              : null,
          };
        } catch (e) {
          return { symbol: s.toUpperCase(), error: (e as Error).message };
        }
      }),
    );
    return {
      source: 'Vietcap; chỉ số TTM theo quý gần nhất',
      note: 'pe/pb là số tại quý báo cáo gần nhất; peNow là P/E theo giá hiện tại. pePercentileInOwnHistory = % số quý trong lịch sử (~8 năm) có P/E thấp hơn hiện tại (thấp = rẻ so với chính nó).',
      rows,
    };
  }
}
