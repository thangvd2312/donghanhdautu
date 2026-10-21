import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PrismaService } from '../prisma/prisma.module';
import { TEMPLATE_CSV } from './csv-import';
import { AnalyticsService } from '../analytics/analytics.service';
import { CorporateActionsService } from './corporate-actions.service';
import { HistoryService } from './history.service';
import { ImportDto, ImportService } from './import.service';
import { computeLedger, performance } from './ledger';
import type { LedgerResult } from './ledger';
import { toLedgerTx, TransactionDto, TransactionsService } from './transactions';
import { newStockSymbols, rebalance } from './rebalance';
import { RebalanceDto } from './rebalance.dto';
import { SHOCK_MAX_PCT, SHOCK_MIN_PCT, simulate } from './simulate';
import { HoldingInput, valuePortfolio } from './valuation';

/** Khai báo nhanh một tài sản đang có (onboarding / "khai báo tài sản đang có") = giao dịch số dư đầu kỳ */
class HoldingDto {
  @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType!: AssetType;
  @IsString() symbol!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) avgCost!: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
}

const PCT_RANGE = `phải nằm trong khoảng ${SHOCK_MIN_PCT}% đến +${SHOCK_MAX_PCT}%`;

class ShocksDto {
  @IsOptional() @IsNumber({}, { message: `stock ${PCT_RANGE}` }) @Min(SHOCK_MIN_PCT) @Max(SHOCK_MAX_PCT) stock?: number;
  @IsOptional()
  @IsNumber({}, { message: `crypto ${PCT_RANGE}` })
  @Min(SHOCK_MIN_PCT)
  @Max(SHOCK_MAX_PCT)
  crypto?: number;
  @IsOptional() @IsNumber({}, { message: `gold ${PCT_RANGE}` }) @Min(SHOCK_MIN_PCT) @Max(SHOCK_MAX_PCT) gold?: number;
  @IsOptional() @IsNumber({}, { message: `fx ${PCT_RANGE}` }) @Min(SHOCK_MIN_PCT) @Max(SHOCK_MAX_PCT) fx?: number;
  /** Giá trị từng mã được kiểm tra trong simulate() */
  @IsOptional() @IsObject() symbols?: Record<string, number>;
}

/** Kịch bản mô phỏng: không ghi gì vào sổ */
export class SimulateDto {
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string | null;
  @IsObject() @ValidateNested() @Type(() => ShocksDto) shocks!: ShocksDto;
}

class DismissDto {
  @IsString() @MaxLength(120) key!: string;
}

class PortfolioNameDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
}

@Injectable()
export class PortfolioService {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private transactions: TransactionsService,
  ) {}

  /**
   * Định giá theo giá thị trường hiện tại, quy ra VND, kèm trạng thái dữ liệu.
   * Không truyền danh mục = gộp mọi danh mục (bảng Holding); có danh mục = tính từ sổ của riêng danh mục đó.
   */
  async valuation(userId: string, portfolioId?: string) {
    const holdings: HoldingInput[] = portfolioId
      ? holdingsFromLedger(await this.transactions.ledger(userId, portfolioId), portfolioId, this.market.usdtVnd.rate)
      : await this.prisma.holding.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return this.value(holdings);
  }

  /**
   * Mô phỏng kịch bản giá trên tài sản đang giữ. "Trước" lấy từ đúng valuation() mà màn Danh mục dùng
   * (cùng danh mục, giá, trạng thái giá, tỷ giá); không ghi gì vào DB.
   */
  async simulate(userId: string, dto: SimulateDto) {
    const portfolioId = dto.portfolioId || undefined;
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, userId, portfolioId);
    const v = await this.valuation(userId, portfolioId);
    return { ...simulate(v.holdings, dto.shocks), asOf: v.generatedAt };
  }

  /**
   * Mô phỏng tái cân bằng về tỷ trọng mục tiêu. "Trước" lấy từ đúng valuation() mà màn Danh mục dùng;
   * mã cổ phiếu mới được kiểm tra tồn tại; không ghi gì vào DB.
   */
  async rebalance(userId: string, dto: RebalanceDto) {
    const portfolioId = dto.portfolioId || undefined;
    if (portfolioId) await this.transactions.resolvePortfolio(this.prisma, userId, portfolioId);
    const v = await this.valuation(userId, portfolioId);
    const newStocks = await Promise.all(
      newStockSymbols(v.holdings, dto.targets).map(async (symbol) => {
        try {
          await this.market.assertStock(symbol);
        } catch (e) {
          if (e instanceof NotFoundException) throw new BadRequestException(`Mã cổ phiếu ${symbol} không tồn tại`);
          throw e;
        }
        await this.market.stockQuote(symbol).catch(() => null);
        return { symbol, price: this.market.priceInfo('stock', symbol).value };
      }),
    );
    const goldBuyPrices = Object.fromEntries(
      this.market
        .goldQuotes()
        .filter((g) => g.currency === 'VND')
        .map((g) => [g.code, g.sell]),
    );
    return rebalance(dto, { holdings: v.holdings, newStocks, goldBuyPrices, asOf: v.generatedAt });
  }

  /**
   * Coin: thêm lãi/lỗ VND thực tế bên cạnh lãi theo USDT. VND thực tế = giá trị hôm nay − số VND đã bỏ ra theo tỷ giá
   * lúc mua; phần chênh do tỷ giá = giá vốn USDT quy tỷ giá hôm nay − số VND đã bỏ ra. Lô thiếu tỷ giá → không tính.
   */
  async withVndActual<V extends Awaited<ReturnType<PortfolioService['valuation']>>>(
    userId: string,
    v: V,
    portfolioId?: string,
  ) {
    if (!v.holdings.some((h) => h.assetType === 'crypto')) return v;
    const ledger = await this.transactions.ledger(userId, portfolioId);
    const pos = new Map(ledger.positions.map((p) => [`${p.assetType}:${p.symbol}`, p]));
    return {
      ...v,
      holdings: v.holdings.map((h) => {
        if (h.assetType !== 'crypto') return h;
        const costVnd = pos.get(`${h.assetType}:${h.symbol}`)?.costBasisVnd?.toNumber() ?? null;
        return {
          ...h,
          vndActual:
            costVnd === null
              ? { known: false as const }
              : {
                  known: true as const,
                  costVnd,
                  pnlVnd: h.marketValue !== null ? h.marketValue - costVnd : null,
                  pnlVndPct: h.marketValue !== null && costVnd ? ((h.marketValue - costVnd) / costVnd) * 100 : null,
                  fxEffectVnd: h.costValue - costVnd,
                },
        };
      }),
    };
  }

  private async value(holdings: HoldingInput[]) {
    // Mã cổ phiếu mới thêm có thể chưa có trong bộ nhớ đệm
    await Promise.all(
      holdings.filter((h) => h.assetType === 'stock').map((h) => this.market.stockQuote(h.symbol).catch(() => null)),
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
  async performance(userId: string, portfolioId?: string) {
    const ledger = await this.transactions.ledger(userId, portfolioId);
    const v = await this.valuation(userId, portfolioId);
    // Lãi chưa chốt chỉ tính trên tài sản đầu tư (tiền mặt USDT đổi giá theo tỷ giá không phải lãi đầu tư)
    const invested = v.holdings.filter((h) => h.assetType !== 'cash');
    const unrealized = invested.some((h) => h.pnl !== null) ? invested.reduce((s, h) => s + (h.pnl ?? 0), 0) : null;
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
      portfolioId: dto.portfolioId,
    });
  }

  /** Danh mục kèm giá trị hiện tại và số giao dịch */
  async listPortfolios(userId: string) {
    const [list, txs] = await Promise.all([
      this.transactions.portfolios(this.prisma, userId),
      this.transactions.activeTransactions(userId),
    ]);
    const rate = this.market.usdtVnd.rate;
    return Promise.all(
      list.map(async (p) => {
        const own = txs.filter((t) => t.portfolioId === p.id);
        let totalValue = 0;
        if (own.length) {
          const v = await this.value(holdingsFromLedger(computeLedger(own.map(toLedgerTx)), p.id, rate));
          totalValue = v.totalValue;
        }
        return { id: p.id, name: p.name, isDefault: p.isDefault, transactionCount: own.length, totalValue };
      }),
    );
  }

  /** Mỗi tài sản đang nằm ở danh mục nào, bao nhiêu (để biết bán từ đâu) */
  async breakdown(userId: string) {
    const [list, txs] = await Promise.all([
      this.transactions.portfolios(this.prisma, userId),
      this.transactions.activeTransactions(userId),
    ]);
    const out: Record<string, { portfolioId: string; name: string; quantity: number }[]> = {};
    if (list.length < 2) return out;
    for (const p of list) {
      const own = txs.filter((t) => t.portfolioId === p.id);
      if (!own.length) continue;
      const l = computeLedger(own.map(toLedgerTx));
      const add = (key: string, q: number) => (out[key] ??= []).push({ portfolioId: p.id, name: p.name, quantity: q });
      for (const pos of l.positions)
        if (pos.quantity.gt(0)) add(`${pos.assetType}:${pos.symbol}`, pos.quantity.toNumber());
      for (const c of ['VND', 'USDT'] as const) if (l.cash[c].gt(0)) add(`cash:${c}`, l.cash[c].toNumber());
    }
    return out;
  }

  async createPortfolio(userId: string, name: string) {
    await this.transactions.portfolios(this.prisma, userId);
    const p = await this.prisma.portfolio.create({ data: { userId, name: name.trim() } });
    return { id: p.id, name: p.name, isDefault: false };
  }

  async renamePortfolio(userId: string, id: string, name: string) {
    const p = await this.prisma.portfolio.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy danh mục');
    await this.prisma.portfolio.update({ where: { id }, data: { name: name.trim() } });
    return { id, name: name.trim() };
  }

  /** Chỉ xoá được danh mục trống (không còn giao dịch) và không phải danh mục chính */
  async deletePortfolio(userId: string, id: string) {
    const p = await this.prisma.portfolio.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy danh mục');
    if (p.isDefault) throw new BadRequestException('Không xoá được danh mục chính');
    const used = await this.prisma.transaction.count({ where: { portfolioId: id, deletedAt: null } });
    if (used) throw new BadRequestException(`Danh mục còn ${used} giao dịch — huỷ hoặc chuyển giao dịch trước khi xoá`);
    await this.prisma.$transaction([
      // Giao dịch đã huỷ vẫn giữ lịch sử, chỉ bỏ liên kết tới danh mục bị xoá
      this.prisma.transaction.updateMany({ where: { portfolioId: id }, data: { portfolioId: null } }),
      this.prisma.portfolio.delete({ where: { id } }),
    ]);
    return { ok: true };
  }
}

/** Vị thế và tiền mặt của một sổ → đầu vào định giá */
function holdingsFromLedger(l: LedgerResult, portfolioId: string, usdtRate: number): HoldingInput[] {
  const out: HoldingInput[] = l.positions
    .filter((p) => p.quantity.gt(0))
    .map((p) => ({
      id: `${portfolioId}:${p.assetType}:${p.symbol}`,
      assetType: p.assetType,
      symbol: p.symbol,
      quantity: p.quantity.toNumber(),
      avgCost: p.costBasis.div(p.quantity).toNumber(),
      note: p.note,
    }));
  for (const c of ['VND', 'USDT'] as const) {
    if (!l.cash[c].gt(0)) continue;
    out.push({
      id: `${portfolioId}:cash:${c}`,
      assetType: 'cash',
      symbol: c,
      quantity: l.cash[c].toNumber(),
      avgCost: c === 'VND' ? 1 : usdtRate,
      note: null,
    });
  }
  return out;
}

@UseGuards(JwtAuthGuard)
@Controller('portfolio')
class PortfolioController {
  constructor(
    private portfolio: PortfolioService,
    private transactions: TransactionsService,
    private imports: ImportService,
    private historyService: HistoryService,
    private market: MarketService,
    private prisma: PrismaService,
    private corporateActions: CorporateActionsService,
    private analytics: AnalyticsService,
  ) {}

  /** Sự kiện quyền (cổ phiếu thưởng, chia tách, cổ tức) được hưởng nhưng chưa ghi vào sổ */
  @Get('corporate-actions')
  missingActions(@CurrentUser() user: AuthUser) {
    return this.corporateActions.missing(user.id);
  }

  /** Lịch thu nhập cổ tức: đã nhận và dự kiến theo tháng. ?past=1–36 (mặc định 12 tháng) */
  @Get('income')
  income(@CurrentUser() user: AuthUser, @Query('past') past?: string) {
    return this.corporateActions.income(user.id, past);
  }

  @Post('corporate-actions/dismiss')
  dismissAction(@CurrentUser() user: AuthUser, @Body() dto: DismissDto) {
    return this.corporateActions.dismiss(user.id, dto.key);
  }

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

  /** Thử kịch bản giá (cổ phiếu −10%, vàng +5%, tỷ giá +2%…) lên tài sản đang giữ; không ghi vào sổ */
  @Post('simulate')
  simulate(@CurrentUser() user: AuthUser, @Body() dto: SimulateDto) {
    return this.portfolio.simulate(user.id, dto);
  }

  /** Mô phỏng tái cân bằng (chỉ dùng tiền mới hoặc cho phép bán); không ghi vào sổ */
  @Post('rebalance')
  rebalance(@CurrentUser() user: AuthUser, @Body() dto: RebalanceDto) {
    return this.portfolio.rebalance(user.id, dto);
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

  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthUser, @Query('portfolioId') portfolioId?: string) {
    return this.transactions.list(user.id, portfolioId || undefined);
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

  /** File CSV mẫu để nhập giao dịch */
  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="mau-giao-dich.csv"')
  importTemplate() {
    return `\uFEFF${TEMPLATE_CSV}`;
  }

  /** Xem trước file CSV: không ghi gì vào sổ */
  @Post('import/preview')
  importPreview(@CurrentUser() user: AuthUser, @Body() dto: ImportDto) {
    return this.imports.preview(user.id, dto);
  }

  @Post('import/commit')
  importCommit(@CurrentUser() user: AuthUser, @Body() dto: ImportDto) {
    return this.imports.commit(user.id, dto);
  }

  @Get('import/batches')
  importBatches(@CurrentUser() user: AuthUser) {
    return this.transactions.importBatches(user.id);
  }

  @Post('import/batches/:id/undo')
  undoImport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transactions.undoImport(user.id, id);
  }

  @Get('transactions/:id/revisions')
  revisions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transactions.revisions(user.id, id);
  }
}

@Module({
  imports: [MarketModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, TransactionsService, ImportService, HistoryService, CorporateActionsService],
  exports: [PortfolioService, TransactionsService, HistoryService, CorporateActionsService],
})
export class PortfolioModule {}
