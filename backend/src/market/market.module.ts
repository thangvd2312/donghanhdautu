import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { CompareService } from './compare.service';
import { MarketController } from './market.controller';
import { MarketGateway } from './market.gateway';
import { MarketService } from './market.service';
import { MarketCacheModule } from './cache/market-cache.module';
import { BinanceProvider } from './providers/binance.provider';
import { CryptoMarketProvider } from './providers/crypto-market.provider';
import { GoldFxProvider } from './providers/gold-fx.provider';
import { VietcapModule } from './providers/vietcap';
import { VndirectProvider } from './providers/vndirect.provider';
import { StockResearchService } from './stock-research.service';
import { TrackedSymbolResolver } from './tracked-symbol.resolver';

@Module({
  imports: [AuthModule, VietcapModule, RuntimeModule, MarketCacheModule],
  controllers: [MarketController],
  providers: [
    MarketService,
    StockResearchService,
    CompareService,
    MarketGateway,
    VndirectProvider,
    BinanceProvider,
    CryptoMarketProvider,
    GoldFxProvider,
    TrackedSymbolResolver,
  ],
  exports: [
    MarketService,
    StockResearchService,
    MarketGateway,
    VietcapModule,
    VndirectProvider,
    TrackedSymbolResolver,
    CryptoMarketProvider,
  ],
})
export class MarketModule {}
