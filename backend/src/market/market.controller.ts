import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import type {
  Candle,
  CompareResponse,
  CryptoDetail,
  MarketSnapshot,
  StockDetail,
  StockDividends,
  StockFundamentals,
  StockHit,
} from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompareService } from './compare.service';
import { MarketService } from './market.service';
import { StockResearchService } from './stock-research.service';

@UseGuards(JwtAuthGuard)
@Controller('market')
export class MarketController {
  constructor(
    private market: MarketService,
    private research: StockResearchService,
    private compareService: CompareService,
  ) {}

  @Get('snapshot')
  snapshot(): MarketSnapshot {
    return this.market.snapshot();
  }

  @Get('search')
  search(@Query('q') q = ''): Promise<StockHit[]> {
    return this.market.searchStocks(q);
  }

  @Get('compare')
  compare(
    @CurrentUser() user: AuthUser,
    @Query('symbols') symbols?: string,
    @Query('range') range?: string,
  ): Promise<CompareResponse> {
    return this.compareService.compare(user.id, symbols, range);
  }

  @Get('stocks/:symbol')
  stock(@Param('symbol') symbol: string): Promise<StockDetail> {
    return this.research.stockDetail(symbol);
  }

  @Get('stocks/:symbol/fundamentals')
  stockFundamentals(@Param('symbol') symbol: string): Promise<StockFundamentals> {
    return this.research.stockFundamentals(symbol);
  }

  @Get('stocks/:symbol/dividends')
  stockDividends(@Param('symbol') symbol: string): Promise<StockDividends> {
    return this.research.stockDividends(symbol);
  }

  @Get('stocks/:symbol/history')
  stockHistory(
    @Param('symbol') symbol: string,
    @Query('days', new DefaultValuePipe(365), ParseIntPipe) days: number,
  ): Promise<Candle[]> {
    return this.market.stockHistory(symbol, days);
  }

  @Get('crypto/:symbol')
  crypto(@Param('symbol') symbol: string): Promise<CryptoDetail> {
    return this.market.cryptoDetail(symbol);
  }

  @Get('crypto/:symbol/history')
  cryptoHistory(
    @Param('symbol') symbol: string,
    @Query('days', new DefaultValuePipe(365), ParseIntPipe) days: number,
  ): Promise<Candle[]> {
    return this.market.cryptoHistory(symbol, days);
  }
}
