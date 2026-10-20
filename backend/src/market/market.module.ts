import { Controller, Get, Module, Param, ParseIntPipe, DefaultValuePipe, Query, UseGuards } from '@nestjs/common';
import { AuthModule, JwtAuthGuard } from '../auth/auth.module';
import { MarketGateway } from './market.gateway';
import { MarketService } from './market.service';
import { BinanceProvider } from './providers/binance.provider';
import { GoldFxProvider } from './providers/gold-fx.provider';
import { VietcapProvider } from './providers/vietcap.provider';

@UseGuards(JwtAuthGuard)
@Controller('market')
class MarketController {
  constructor(private market: MarketService) {}

  @Get('snapshot')
  snapshot() {
    return this.market.snapshot();
  }

  @Get('search')
  search(@Query('q') q = '') {
    return this.market.searchStocks(q);
  }

  @Get('stocks/:symbol')
  stock(@Param('symbol') symbol: string) {
    return this.market.stockDetail(symbol);
  }

  @Get('stocks/:symbol/fundamentals')
  stockFundamentals(@Param('symbol') symbol: string) {
    return this.market.stockFundamentals(symbol);
  }

  @Get('stocks/:symbol/history')
  stockHistory(
    @Param('symbol') symbol: string,
    @Query('days', new DefaultValuePipe(365), ParseIntPipe) days: number,
  ) {
    return this.market.stockHistory(symbol, days);
  }

  @Get('crypto/:symbol')
  crypto(@Param('symbol') symbol: string) {
    return this.market.cryptoDetail(symbol);
  }

  @Get('crypto/:symbol/history')
  cryptoHistory(
    @Param('symbol') symbol: string,
    @Query('days', new DefaultValuePipe(365), ParseIntPipe) days: number,
  ) {
    return this.market.cryptoHistory(symbol, days);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [MarketController],
  providers: [MarketService, MarketGateway, VietcapProvider, BinanceProvider, GoldFxProvider],
  exports: [MarketService, MarketGateway, VietcapProvider],
})
export class MarketModule {}
