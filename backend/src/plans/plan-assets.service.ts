import { BadRequestException, Injectable } from '@nestjs/common';
import { MarketService } from '../market/market.service';
import { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import type { PlanAsset } from './dto/plan.dto';
import { displaySymbol } from './plan-rules';

/** Market lookups shared by plan features: price in the plan's unit, display names, symbol validation. */
@Injectable()
export class PlanAssetsService {
  constructor(
    private market: MarketService,
    private symbols: TrackedSymbolResolver,
  ) {}

  /** Giá hiện tại theo đơn vị của kế hoạch: VND/cp, USDT/coin, VND/lượng (giá mua vào) */
  priceNative(assetType: string, symbol: string) {
    const info = this.market.priceInfo(assetType as PlanAsset, symbol);
    const value =
      info.value === null ? null : assetType === 'crypto' ? info.value / this.market.usdtVnd.rate : info.value;
    return { value, status: info.status, source: info.source, asOf: info.asOf };
  }

  async normalize(assetType: PlanAsset, raw: string) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol) throw new BadRequestException('Chọn tài sản');
    return this.symbols.resolve(assetType, symbol, { lenientQuote: true });
  }

  displayName(assetType: string, symbol: string) {
    if (assetType === 'gold') return this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol;
    return displaySymbol(assetType, symbol);
  }
}
