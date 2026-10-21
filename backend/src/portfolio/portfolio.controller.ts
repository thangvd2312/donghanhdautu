import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.module';
import { HistoryService } from './history.service';
import { HoldingDto, PortfolioNameDto } from './portfolio.dto';
import { PortfolioService } from './portfolio.service';
import { TransactionsService } from './transactions';

@UseGuards(JwtAuthGuard)
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private portfolio: PortfolioService,
    private transactions: TransactionsService,
    private historyService: HistoryService,
    private market: MarketService,
    private prisma: PrismaService,
    private analytics: AnalyticsService,
  ) {}

  /** ?portfolioId=… để xem riêng một danh mục; bỏ trống = gộp, kèm tài sản nằm ở danh mục nào */
  @Get()
  async get(@CurrentUser() user: AuthUser, @Query('portfolioId') portfolioId?: string) {
    if (portfolioId) {
      await this.transactions.resolvePortfolio(this.prisma, user.id, portfolioId);
      return this.portfolio.withVndActual(user.id, await this.portfolio.valuation(user.id, portfolioId), portfolioId);
    }
    const [v, breakdown] = await Promise.all([
      this.portfolio.valuation(user.id).then((x) => this.portfolio.withVndActual(user.id, x)),
      this.portfolio.breakdown(user.id),
    ]);
    // Đo chất lượng dữ liệu: trạng thái giá của danh mục mỗi ngày người dùng mở (chỉ khi có tài sản)
    if (v.holdings.length) {
      void this.analytics.track('portfolio_valued', {
        userId: user.id,
        props: { status: v.dataQuality.status },
        dedupeKey: `portfolio_valued:${vnDateKey()}`,
      });
    }
    return {
      ...v,
      holdings: v.holdings.map((h) => ({ ...h, portfolios: breakdown[`${h.assetType}:${h.symbol}`] ?? [] })),
    };
  }

  /** Tổng tài sản và vốn đưa vào theo ngày + hiệu quả trong kỳ. range: 1m | 3m | 6m | 1y | all */
  @Get('history')
  async history(
    @CurrentUser() user: AuthUser,
    @Query('range') range = '3m',
    @Query('portfolioId') portfolioId?: string,
  ) {
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, user.id, portfolioId);
    return this.historyService.history(user.id, range, portfolioId);
  }

  @Get('performance')
  async performance(@CurrentUser() user: AuthUser, @Query('portfolioId') portfolioId?: string) {
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, user.id, portfolioId);
    return this.portfolio.performance(user.id, portfolioId);
  }

  @Get('portfolios')
  portfolios(@CurrentUser() user: AuthUser) {
    return this.portfolio.listPortfolios(user.id);
  }

  @Post('portfolios')
  createPortfolio(@CurrentUser() user: AuthUser, @Body() dto: PortfolioNameDto) {
    return this.portfolio.createPortfolio(user.id, dto.name);
  }

  @Patch('portfolios/:id')
  renamePortfolio(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PortfolioNameDto) {
    return this.portfolio.renamePortfolio(user.id, id, dto.name);
  }

  @Delete('portfolios/:id')
  deletePortfolio(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.portfolio.deletePortfolio(user.id, id);
  }

  /** Danh sách loại vàng hợp lệ để chọn khi nhập tài sản */
  @Get('gold-options')
  goldOptions() {
    return this.market
      .goldQuotes()
      .filter((g) => g.currency === 'VND')
      .map((g) => ({ code: g.code, name: g.name, buy: g.buy, sell: g.sell }));
  }

  @Post('holdings')
  addHolding(@CurrentUser() user: AuthUser, @Body() dto: HoldingDto) {
    return this.portfolio.addHolding(user.id, dto);
  }
}
