import { Injectable } from '@nestjs/common';
import { Cron, Interval, Timeout } from '@nestjs/schedule';
import { AlertsService } from '../alerts/alerts.service';
import { BriefsService } from '../alerts/briefs.service';
import { CryptoBriefService } from '../alerts/crypto-brief.service';
import { WeeklyBriefService } from '../alerts/weekly.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { EventsService } from '../events/events.service';
import { MacroService } from '../macro/macro.service';
import { MarketDataCache } from '../market/cache/market-data-cache';
import { NewsIndexerService } from '../news/search/news-indexer.service';
import { VN_TZ } from '../market/types';
import { PlanReminderService } from '../plans/plan-reminder.service';
import { JournalService } from '../journal/journal.service';
import { HistoryService } from '../portfolio/history.service';
import { PortfolioAlertsRunner } from '../portfolio-alerts/portfolio-alerts.runner';
import { JobRunner } from '../runtime/job-runner';
import { TipReviewService } from '../tips/tip-review.service';

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Lịch việc nền — nơi DUY NHẤT khai báo @Cron / @Interval, và chỉ nằm trong WorkerModule nên web không bao giờ chạy.
 * Mỗi lượt đi qua JobRunner (khoá tư vấn PostgreSQL theo tên việc) nên không chạy trùng dù có hai worker.
 * Logic nghiệp vụ nằm ở các service; ở đây chỉ có lịch + tên khoá.
 *
 * | Việc                    | Lịch (giờ VN)            | Service                              |
 * | briefs.morning          | 8:30 thứ 2-6            | BriefsService.morning (xếp hàng đợi) |
 * | briefs.closing          | 15:10 thứ 2-6           | BriefsService.closing (xếp hàng đợi) |
 * | briefs.weekly           | 9:00 thứ 7              | WeeklyBriefService.runAll            |
 * | briefs.crypto           | đầu mỗi giờ, hằng ngày  | CryptoBriefService.runAll (xếp hàng đợi) |
 * | plans.remindDue         | 8:00 hằng ngày          | PlanReminderService.remindDue        |
 * | journal.monthlyDigest   | 9:00 ngày 1 hằng tháng  | JournalService.monthlyDigest         |
 * | events.remind           | 8:00, 17:00 hằng ngày   | EventsService.remindDaily            |
 * | history.recordDaily     | 23:50 hằng ngày         | HistoryService.recordDaily           |
 * | portfolioAlerts.intraday| 9:00–14:30 mỗi 30 phút, thứ 2-6 | PortfolioAlertsRunner.runAll (tập trung, lệch tỷ trọng) |
 * | portfolioAlerts.daily   | 15:20 hằng ngày         | PortfolioAlertsRunner.runAll (cả giảm từ đỉnh) |
 * | tips.review             | 15:30 hằng ngày         | TipReviewService.runDue (chấm lại lời khuyên sau 30 / 90 ngày) |
 * | analytics.purge         | 3:30 hằng ngày          | AnalyticsService.purge               |
 * | market-cache.purge      | phút 17 mỗi giờ         | MarketDataCache.purgeExpiredJob      |
 * | alerts.prices           | mỗi 60 giây             | AlertsService.checkPrices            |
 * | alerts.news             | mỗi 10 phút             | AlertsService.checkNews              |
 * | macro.refresh           | mỗi 2 giờ               | MacroService.refresh                 |
 * | news.index              | 20 giây sau khi worker chạy, rồi mỗi 5 phút | NewsIndexerService.sync (lưu tin vào DB, đưa tin mới / đã đổi sang OpenSearch) |
 * | news.purge              | 3:40 hằng ngày          | NewsIndexerService.purge (xoá tin quá 180 ngày ở DB và OpenSearch) |
 */
@Injectable()
export class ScheduledJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly briefs: BriefsService,
    private readonly weekly: WeeklyBriefService,
    private readonly cryptoBriefs: CryptoBriefService,
    private readonly plans: PlanReminderService,
    private readonly journal: JournalService,
    private readonly events: EventsService,
    private readonly history: HistoryService,
    private readonly portfolioAlerts: PortfolioAlertsRunner,
    private readonly analytics: AnalyticsService,
    private readonly cache: MarketDataCache,
    private readonly alerts: AlertsService,
    private readonly macro: MacroService,
    private readonly tips: TipReviewService,
    private readonly newsIndexer: NewsIndexerService,
  ) {}

  @Cron('30 8 * * 1-5', { timeZone: VN_TZ })
  briefsMorning() {
    return this.jobs.run('briefs.morning', () => this.briefs.morning());
  }

  @Cron('10 15 * * 1-5', { timeZone: VN_TZ })
  briefsClosing() {
    return this.jobs.run('briefs.closing', () => this.briefs.closing());
  }

  @Cron('0 9 * * 6', { timeZone: VN_TZ })
  briefsWeekly() {
    return this.jobs.run('briefs.weekly', () => this.weekly.runAll());
  }

  /** Coin giao dịch 24/7: bản tin coin mỗi giờ, cả thứ 7, chủ nhật */
  @Cron('0 * * * *', { timeZone: VN_TZ })
  briefsCrypto() {
    return this.jobs.run('briefs.crypto', () => this.cryptoBriefs.runAll());
  }

  @Cron('0 8 * * *', { timeZone: VN_TZ })
  plansRemindDue() {
    return this.jobs.run('plans.remindDue', () => this.plans.remindDue());
  }

  @Cron('0 9 1 * *', { timeZone: VN_TZ })
  journalMonthlyDigest() {
    return this.jobs.run('journal.monthlyDigest', () => this.journal.monthlyDigest());
  }

  @Cron('0 8,17 * * *', { timeZone: VN_TZ })
  eventsRemind() {
    return this.jobs.run('events.remind', () => this.events.remindDaily());
  }

  @Cron('50 23 * * *', { timeZone: VN_TZ })
  historyRecordDaily() {
    return this.jobs.run('history.recordDaily', () => this.history.recordDaily());
  }

  @Cron('0,30 9-14 * * 1-5', { timeZone: VN_TZ })
  portfolioAlertsIntraday() {
    return this.jobs.run('portfolioAlerts.intraday', () => this.portfolioAlerts.runAll({ drawdown: false }));
  }

  /** Sau phiên (giá đóng cửa đã chốt): cả ba quy tắc; chạy cả cuối tuần cho danh mục vàng / crypto */
  @Cron('20 15 * * *', { timeZone: VN_TZ })
  portfolioAlertsDaily() {
    return this.jobs.run('portfolioAlerts.daily', () => this.portfolioAlerts.runAll({ drawdown: true }));
  }

  /** Sau phiên (giá đóng cửa đã chốt), cả cuối tuần cho coin: chấm lại lời khuyên đã soi đủ 30 / 90 ngày */
  @Cron('30 15 * * *', { timeZone: VN_TZ })
  tipsReview() {
    return this.jobs.run('tips.review', () => this.tips.runDue());
  }

  @Cron('30 3 * * *', { timeZone: VN_TZ })
  analyticsPurge() {
    return this.jobs.run('analytics.purge', () => this.analytics.purge());
  }

  @Cron('17 * * * *')
  marketCachePurge() {
    return this.jobs.run('market-cache.purge', () => this.cache.purgeExpiredJob());
  }

  @Interval(MIN)
  alertsPrices() {
    return this.jobs.run('alerts.prices', () => this.alerts.checkPrices(), { quiet: true });
  }

  @Interval(10 * MIN)
  alertsNews() {
    return this.jobs.run('alerts.news', () => this.alerts.checkNews());
  }

  @Interval(2 * HOUR)
  macroRefresh() {
    return this.jobs.run('macro.refresh', () => this.macro.refresh());
  }

  @Interval(5 * MIN)
  newsIndex() {
    return this.jobs.run('news.index', () => this.newsIndexer.sync(), { quiet: true });
  }

  /** Kho tin là nguồn của trang Tin tức: không chờ 5 phút sau khi worker khởi động (deploy, lần chạy đầu) */
  @Timeout(20_000)
  newsIndexOnBoot() {
    return this.newsIndex();
  }

  @Cron('40 3 * * *', { timeZone: VN_TZ })
  newsPurge() {
    return this.jobs.run('news.purge', () => this.newsIndexer.purge());
  }
}
