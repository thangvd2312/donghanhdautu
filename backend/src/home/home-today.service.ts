import { Injectable } from '@nestjs/common';
import type { HomeToday } from '@dautu/contracts';
import { MarketService } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { toLedgerTx } from '../portfolio/transactions.presenter';
import { TransactionsService } from '../portfolio/transactions.service';
import { buildDayLedger } from './day-ledger';
import { dayChange } from './today';

/** The "today" block of the home page: value, P&L and the day's change computed from the ledger. */
@Injectable()
export class HomeTodayService {
  constructor(
    private market: MarketService,
    private portfolio: PortfolioService,
    private transactions: TransactionsService,
  ) {}

  async today(userId: string): Promise<HomeToday> {
    const [v, txs] = await Promise.all([
      this.portfolio.valuation(userId),
      this.transactions.activeTransactions(userId).then((list) => list.map(toLedgerTx)),
    ]);
    return {
      hasHoldings: v.holdings.length > 0,
      totalValue: v.totalValue,
      totalIsEstimate: v.totalIsEstimate,
      totalPnl: v.totalPnl,
      totalPnlPct: v.totalPnlPct,
      allocationPct: v.allocationPct,
      day: dayChange(
        v,
        buildDayLedger(txs, v, vnDateKey(), {
          usdtRate: this.market.usdtVnd.rate,
          displayName: (type, symbol) => this.displayName(type, symbol),
          priceVnd: (type, symbol) => this.market.priceInfo(type, symbol).value,
          dayChangePct: (type, symbol) => this.market.dayChangePct(type, symbol),
        }),
      ),
      stockSessionOpen: this.market.stockSessionOpen,
      dataQuality: v.dataQuality,
      generatedAt: v.generatedAt,
    };
  }

  private displayName(assetType: AssetType, symbol: string) {
    return assetType === 'gold'
      ? (this.market.goldQuotes().find((g) => g.code === symbol)?.name ?? symbol)
      : symbol.replace(/USDT$/, '');
  }
}
