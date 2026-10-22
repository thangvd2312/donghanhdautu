import { Injectable, Logger } from '@nestjs/common';
import { MarketService } from '../market/market.service';
import { HoldingMoveAlerts } from './holding-move-alerts.service';
import { MacroAlerts } from './macro-alerts.service';
import { NewsAlerts } from './news-alerts.service';
import { NewsTaggerService } from './news-tagger.service';
import { PriceAlertsService } from './price-alerts.service';

/**
 * Entry points for the worker's alert crons. Each scan is single-flight inside the process and delegates to the
 * alert source that owns the rule:
 *  - prices: holdings moving past the user's threshold, user-set price targets, USD / USDT moves
 *  - news: news on held tickers (AI-tagged), important macro / geopolitical news
 */
@Injectable()
export class AlertsService {
  private log = new Logger(AlertsService.name);
  private running = { price: false, news: false };

  constructor(
    private market: MarketService,
    private tagger: NewsTaggerService,
    private holdingMoves: HoldingMoveAlerts,
    private priceTargets: PriceAlertsService,
    private newsAlerts: NewsAlerts,
    private macroAlerts: MacroAlerts,
  ) {}

  /** Mỗi phút (worker/scheduled-jobs.ts): giá biến động mạnh, chạm mốc đã đặt, tỷ giá */
  async checkPrices() {
    if (this.running.price) return;
    this.running.price = true;
    try {
      await this.market.ensureFresh();
      await this.holdingMoves.check();
      await this.priceTargets.checkTargets();
      await this.macroAlerts.checkFx();
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running.price = false;
    }
  }

  /** Mỗi 10 phút (worker/scheduled-jobs.ts): tin về mã đang nắm giữ và tin vĩ mô quan trọng */
  async checkNews() {
    if (this.running.news) return;
    this.running.news = true;
    try {
      const tags = await this.tagger.tagRecent(24);
      await this.newsAlerts.check(tags);
      await this.macroAlerts.checkNews(tags);
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running.news = false;
    }
  }
}
