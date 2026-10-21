import { Module } from '@nestjs/common';
import { MarketCacheModule } from '../../cache/market-cache.module';
import { VietcapCompanyAdapter } from './company.adapter';
import { VietcapEventsAdapter } from './events.adapter';
import { VietcapHistoryAdapter } from './history.adapter';
import { VietcapOwnershipAdapter } from './ownership.adapter';
import { VietcapQuotesAdapter } from './quotes.adapter';
import { VietcapScreeningAdapter } from './screening.adapter';
import { VietcapStatementsAdapter } from './statements.adapter';
import { VietcapSymbolsAdapter } from './symbols.adapter';
import { VIETCAP_HTTP_OPTIONS, vietcapHttpOptionsFromEnv } from './vietcap.config';
import { VietcapHttpClient } from './vietcap-http.client';

const ADAPTERS = [
  VietcapQuotesAdapter,
  VietcapSymbolsAdapter,
  VietcapHistoryAdapter,
  VietcapCompanyAdapter,
  VietcapStatementsAdapter,
  VietcapOwnershipAdapter,
  VietcapEventsAdapter,
  VietcapScreeningAdapter,
];

/** Dữ liệu chứng khoán VN từ Vietcap: một HTTP client (giới hạn tốc độ dùng chung) và các adapter theo miền dữ liệu */
@Module({
  imports: [MarketCacheModule],
  providers: [
    { provide: VIETCAP_HTTP_OPTIONS, useFactory: () => vietcapHttpOptionsFromEnv() },
    VietcapHttpClient,
    ...ADAPTERS,
  ],
  exports: ADAPTERS,
})
export class VietcapModule {}
