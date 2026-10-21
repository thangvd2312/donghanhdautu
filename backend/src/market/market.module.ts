import { Controller, Get, Module, Param, ParseIntPipe, DefaultValuePipe, Query, UseGuards } from '@nestjs/common';
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
import { RuntimeModule } from '../runtime/runtime.module';
import { AuthModule, CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { CompareService } from './compare.service';
import { MarketGateway } from './market.gateway';
import { MarketService } from './market.service';
import { StockResearchService } from './stock-research.service';
import { BinanceProvider } from './providers/binance.provider';
import { GoldFxProvider } from './providers/gold-fx.provider';
import { VietcapModule } from './providers/vietcap';
import { VndirectProvider } from './providers/vndirect.provider';

@UseGuards(JwtAuthGuard)
@Controller('market')
class MarketController {
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

@Module({
  imports: [AuthModule, VietcapModule, RuntimeModule],
  controllers: [MarketController],
  providers: [
    MarketService,
    StockResearchService,
    CompareService,
    MarketGateway,
    VndirectProvider,
    BinanceProvider,
    GoldFxProvider,
  ],
  exports: [MarketService, StockResearchService, MarketGateway, VietcapModule, VndirectProvider],
})
export class MarketModule {}
