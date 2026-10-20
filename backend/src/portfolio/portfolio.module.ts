import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.module';
import { performance } from './ledger';
import { TransactionDto, TransactionsService } from './transactions';
import { valuePortfolio } from './valuation';

/** Khai báo nhanh một tài sản đang có (onboarding / "khai báo tài sản đang có") = giao dịch số dư đầu kỳ */
class HoldingDto {
  @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType!: AssetType;
  @IsString() symbol!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) avgCost!: number;
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class PortfolioService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private transactions: TransactionsService,
  ) {}

  /** Định giá danh mục theo giá thị trường hiện tại, tất cả quy ra VND, kèm trạng thái dữ liệu */
  async valuation(userId: string) {
    const holdings = await this.prisma.holding.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    // Mã cổ phiếu mới thêm có thể chưa có trong bộ nhớ đệm
    await Promise.all(
      holdings
        .filter((h) => h.assetType === 'stock')
        .map((h) => this.market.stockQuote(h.symbol).catch(() => null)),
    );
    return valuePortfolio(holdings, {
      priceInfo: (type, symbol) => this.market.priceInfo(type, symbol),
      dayChangePct: (type, symbol) => this.market.dayChangePct(type, symbol),
      displayName: (type, symbol) =>
        type === 'gold'
          ? (this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol)
          : type === 'cash'
            ? symbol
            : symbol.replace(/USDT$/, ''),
      usdt: this.market.usdtVnd,
    });
  }

  /** Hiệu quả đầu tư từ sổ giao dịch: vốn đưa vào, lãi đã / chưa chốt, cổ tức, phí, tổng lãi */
  async performance(userId: string) {
    const ledger = await this.transactions.ledger(userId);
    const v = await this.valuation(userId);
    // Lãi chưa chốt chỉ tính trên tài sản đầu tư (tiền mặt USDT đổi giá theo tỷ giá không phải lãi đầu tư)
    const invested = v.holdings.filter((h) => h.assetType !== 'cash');
    const unrealized = invested.some((h) => h.pnl !== null)
      ? invested.reduce((s, h) => s + (h.pnl ?? 0), 0)
      : null;
    return performance({
      ledger,
      totalValueVnd: v.totalValue,
      unrealizedVnd: unrealized,
      totalIsEstimate: v.totalIsEstimate,
      usdtVnd: v.usdtVnd,
    });
  }

  addHolding(userId: string, dto: HoldingDto) {
    return this.transactions.create(userId, {
      type: 'opening',
      date: vnDateKey(),
      assetType: dto.assetType,
      symbol: dto.assetType === 'cash' ? 'VND' : dto.symbol,
      quantity: dto.quantity,
      price: dto.assetType === 'cash' ? 1 : dto.avgCost,
      note: dto.note,
    });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('portfolio')
class PortfolioController {
  constructor(
    private portfolio: PortfolioService,
    private transactions: TransactionsService,
    private market: MarketService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.portfolio.valuation(user.id);
  }

  @Get('performance')
  performance(@CurrentUser() user: AuthUser) {
    return this.portfolio.performance(user.id);
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

  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthUser) {
    return this.transactions.list(user.id);
  }

  @Post('transactions')
  createTransaction(@CurrentUser() user: AuthUser, @Body() dto: TransactionDto) {
    return this.transactions.create(user.id, dto);
  }

  @Put('transactions/:id')
  updateTransaction(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransactionDto) {
    return this.transactions.update(user.id, id, dto);
  }

  @Delete('transactions/:id')
  removeTransaction(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transactions.remove(user.id, id);
  }

  @Get('transactions/:id/revisions')
  revisions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transactions.revisions(user.id, id);
  }
}

@Module({
  imports: [MarketModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, TransactionsService],
  exports: [PortfolioService, TransactionsService],
})
export class PortfolioModule {}
