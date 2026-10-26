import { Injectable } from '@nestjs/common';
import { MarketService } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { AlertAudience } from './alert-audience.service';
import { moveBucket, moveThreshold } from './alert-rules';
import { NotifierService } from './notifier.service';
import { PersonalAlertService } from './personal-alert.service';

/** Giá tài sản đang nắm giữ (cổ phiếu, coin, vàng) và coin đang theo dõi biến động vượt ngưỡng cá nhân */
@Injectable()
export class HoldingMoveAlerts {
  constructor(
    private market: MarketService,
    private audience: AlertAudience,
    private notifier: NotifierService,
    private personal: PersonalAlertService,
  ) {}

  async check() {
    const today = vnDateKey();
    for (const user of await this.audience.withHoldings()) {
      const base = user.profile?.alertThresholdPct ?? 3;
      for (const h of user.holdings) {
        const type = h.assetType as AssetType;
        if (type === 'cash') continue;
        if (type === 'stock' && !this.market.stockSessionOpen) continue;
        const chg = this.market.dayChangePct(type, h.symbol);
        const thr = moveThreshold(type, base);
        if (chg === null || Math.abs(chg) < thr) continue;
        const dedupeKey = `price:${type}:${h.symbol}:${today}:${moveBucket(chg, thr)}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        await this.personal.fire(user, {
          kind: 'price_move',
          dedupeKey,
          severity: Math.abs(chg) >= thr * 2 ? 'critical' : 'warning',
          event: `${h.symbol.replace(/USDT$/, '')} ${chg > 0 ? 'tăng' : 'giảm'} ${Math.abs(chg).toFixed(2)}% ${type === 'crypto' ? 'trong 24 giờ' : 'trong ngày'}`,
          details: this.priceContext(type, h.symbol),
        });
      }
    }
    await this.checkWatchedCoins(today);
  }

  /** Coin chỉ đang theo dõi (không giữ): cùng ngưỡng của coin, cùng khoá chống trùng */
  private async checkWatchedCoins(today: string) {
    for (const user of await this.audience.withCoins()) {
      const thr = moveThreshold('crypto', user.profile?.alertThresholdPct ?? 3);
      for (const c of user.coins.filter((x) => !x.held)) {
        const chg = this.market.dayChangePct('crypto', c.pair);
        if (chg === null || Math.abs(chg) < thr) continue;
        const dedupeKey = `price:crypto:${c.pair}:${today}:${moveBucket(chg, thr)}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        await this.personal.fire(user, {
          kind: 'price_move',
          dedupeKey,
          severity: Math.abs(chg) >= thr * 2 ? 'critical' : 'warning',
          event: `${c.base} (coin bạn đang theo dõi, chưa giữ) ${chg > 0 ? 'tăng' : 'giảm'} ${Math.abs(chg).toFixed(2)}% trong 24 giờ`,
          details: this.priceContext('crypto', c.pair),
        });
      }
    }
  }

  private priceContext(type: AssetType, symbol: string) {
    if (type === 'stock') {
      const [q] = this.market.stocksFor([symbol]);
      return (
        q && {
          price: q.price,
          ref: q.ref,
          ceiling: q.ceiling,
          floor: q.floor,
          volume: q.volume,
          foreignNetVol: q.foreignBuyVol - q.foreignSellVol,
          source: 'Vietcap',
        }
      );
    }
    if (type === 'crypto') return { ...this.market.binance.quotes.get(symbol), source: 'Binance' };
    return { ...this.market.goldQuotes().find((g) => g.code === symbol), source: 'vang.today' };
  }
}
