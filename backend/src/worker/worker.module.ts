import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModule } from '../ai/ai.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EventsModule } from '../events/events.module';
import { MacroModule } from '../macro/macro.module';
import { MarketCacheModule } from '../market/cache/market-cache.module';
import { MarketModule } from '../market/market.module';
import { PlansModule } from '../plans/plans.module';
import { JournalModule } from '../journal/journal.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PortfolioAlertsModule } from '../portfolio-alerts/portfolio-alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ScheduledJobs } from './scheduled-jobs';
import { WorkerLifecycle } from './worker-lifecycle';

/**
 * Vai trò worker: các module nghiệp vụ mà việc nền cần + lịch (ScheduleModule) + WorkerLifecycle. Không có controller
 * nào được phục vụ (application context, không HTTP). ScheduleModule chỉ có ở đây nên @Cron / @Interval không bao giờ chạy ở web.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RuntimeModule,
    AiModule,
    AnalyticsModule,
    MarketModule,
    MarketCacheModule,
    MacroModule,
    PortfolioModule,
    PortfolioAlertsModule,
    AlertsModule,
    PlansModule,
    JournalModule,
    EventsModule,
    TelegramModule,
    PushModule,
  ],
  providers: [ScheduledJobs, WorkerLifecycle],
})
export class WorkerModule {}
