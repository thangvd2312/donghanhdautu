import { Module } from '@nestjs/common';
import { MacroModule } from '../macro/macro.module';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { AlertAudience } from './alert-audience.service';
import { AlertsService } from './alerts.service';
import { BriefQueueService } from './brief-queue.service';
import { BriefRunService } from './brief-run.service';
import { BriefTestService } from './brief-test.service';
import { BriefsController } from './briefs.controller';
import { BriefsService } from './briefs.service';
import { CryptoBriefService } from './crypto-brief.service';
import { CryptoNewsAlerts } from './crypto-news-alerts.service';
import { HoldingMoveAlerts } from './holding-move-alerts.service';
import { LlmService } from './llm.service';
import { MacroAlerts } from './macro-alerts.service';
import { NewsAlerts } from './news-alerts.service';
import { NewsTaggerService } from './news-tagger.service';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationRelayService } from './notification-relay.service';
import { NotificationsController } from './notifications.controller';
import { NotifierService } from './notifier.service';
import { PersonalAlertService } from './personal-alert.service';
import { PriceAlertsController } from './price-alerts.controller';
import { PriceAlertsService } from './price-alerts.service';
import { WeeklyBriefService } from './weekly.service';

@Module({
  imports: [MarketModule, NewsModule, PortfolioModule, MacroModule, RuntimeModule],
  controllers: [NotificationsController, PriceAlertsController, BriefsController],
  providers: [
    AlertsService,
    AlertAudience,
    PersonalAlertService,
    PriceAlertsService,
    HoldingMoveAlerts,
    NewsAlerts,
    CryptoNewsAlerts,
    MacroAlerts,
    BriefsService,
    CryptoBriefService,
    BriefTestService,
    BriefRunService,
    BriefQueueService,
    WeeklyBriefService,
    LlmService,
    NewsTaggerService,
    NotifierService,
    NotificationInboxService,
    NotificationRelayService,
  ],
  exports: [
    LlmService,
    NotifierService,
    AlertsService,
    BriefsService,
    CryptoBriefService,
    WeeklyBriefService,
    BriefQueueService,
  ],
})
export class AlertsModule {}
