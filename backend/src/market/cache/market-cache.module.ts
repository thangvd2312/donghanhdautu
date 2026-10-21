import { Module } from '@nestjs/common';
import { DEFAULT_CACHE_OPTIONS, MARKET_CACHE_OPTIONS, MarketDataCache } from './market-data-cache';
import { MarketDataMetrics } from './market-data-metrics';

/** Bộ nhớ đệm bền (PostgreSQL) cho dữ liệu thị trường không phải thời gian thực. PrismaModule là global */
@Module({
  providers: [{ provide: MARKET_CACHE_OPTIONS, useValue: DEFAULT_CACHE_OPTIONS }, MarketDataMetrics, MarketDataCache],
  exports: [MarketDataCache, MarketDataMetrics],
})
export class MarketCacheModule {}
